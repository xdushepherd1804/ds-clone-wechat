#!/usr/bin/env bash
# =============================================================================
# run-benchmarks.sh — Performance benchmark orchestration script
#
# Runs WebSocket, message throughput, and API load benchmarks using k6.
# Outputs results to benchmarks/results/ and prints a summary.
#
# Usage:
#   ./scripts/run-benchmarks.sh                    # Run all benchmarks
#   ./scripts/run-benchmarks.sh ws                 # WebSocket only
#   ./scripts/run-benchmarks.sh api                # API only
#   ./scripts/run-benchmarks.sh messages           # Message throughput only
#
#   BASE_URL=http://my-server:3000 ./scripts/run-benchmarks.sh
#
# Prerequisites:
#   - k6 installed (or Docker available for containerized runs)
#   - Target services running (docker compose up -d from project root)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCH_DIR="$PROJECT_DIR/benchmarks"
RESULTS_DIR="$BENCH_DIR/results"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

# ─── Configuration ──────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://localhost:3000}"
VUS="${VUS:-100}"
DURATION="${DURATION:-60s}"
RUN_MODE="${1:-all}"  # all | ws | api | messages

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─── Helpers ────────────────────────────────────────────────────────────────
log()  { echo -e "${BLUE}[bench]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR]${NC} $*"; }

# ─── Check prerequisites ────────────────────────────────────────────────────
check_prereqs() {
  mkdir -p "$RESULTS_DIR"

  # Check if k6 is available directly
  if command -v k6 &>/dev/null; then
    K6_CMD="k6"
    ok "k6 found: $(k6 version 2>&1 | head -1)"
    return
  fi

  # Check if Docker is available (for running k6 in container)
  if command -v docker &>/dev/null; then
    K6_CMD="docker"
    ok "Using k6 via Docker"
    return
  fi

  err "Neither k6 nor Docker found. Please install one of:"
  err "  - k6: https://k6.io/docs/get-started/installation/"
  err "  - Docker: https://docs.docker.com/get-docker/"
  exit 1
}

# ─── Check if services are running ──────────────────────────────────────────
check_services() {
  log "Checking if API gateway is reachable at $BASE_URL ..."
  if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$BASE_URL/health" 2>/dev/null | grep -q '200'; then
    ok "API gateway is reachable"
    return 0
  else
    warn "API gateway not reachable at $BASE_URL"
    warn "Start services with: docker compose up -d"
    warn "Or set BASE_URL to point to a running instance"
    warn ""
    warn "Proceeding anyway — benchmarks will fail without a running target."
    return 1
  fi
}

# ─── Run a k6 test ──────────────────────────────────────────────────────────
run_k6_test() {
  local name="$1"
  local script="$2"
  local output_file="$RESULTS_DIR/${name}_${TIMESTAMP}.json"

  log "Running $name benchmark..."
  log "  Script: $script"

  if [ "$K6_CMD" = "docker" ]; then
    # Run k6 via Docker
    docker run --rm \
      --network host \
      -e BASE_URL="$BASE_URL" \
      -e VUS="$VUS" \
      -e DURATION="$DURATION" \
      -v "$BENCH_DIR:/benchmarks" \
      -v "$RESULTS_DIR:/benchmarks/results" \
      grafana/k6:latest run --quiet "/$script" 2>&1 | tee "$output_file"
  else
    # Run k6 directly
    k6 run --quiet \
      -e BASE_URL="$BASE_URL" \
      -e VUS="$VUS" \
      -e DURATION="$DURATION" \
      "$script" 2>&1 | tee "$output_file"
  fi

  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    ok "$name benchmark completed successfully"
  else
    warn "$name benchmark completed with exit code $exit_code (thresholds may have been breached)"
  fi

  return $exit_code
}

# ─── Validate a k6 script ──────────────────────────────────────────────────
validate_script() {
  local script="$1"
  local full_path="${BENCH_DIR}/${script#/benchmarks/}"

  if [ ! -f "$full_path" ]; then
    warn "Script not found: $full_path"
    return 1
  fi

  # Node.js syntax check (k6 uses ES-like syntax compatible with Node.js)
  if command -v node &>/dev/null; then
    if node -c "$full_path" 2>/dev/null; then
      ok "Script $script syntax OK"
      return 0
    else
      warn "Script $script has syntax issues"
      return 1
    fi
  fi

  # Fallback: just confirm the file exists and is readable
  ok "Script $script found (no syntax checker available)"
}

# ─── Main ────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo "=============================================="
  echo "  WeChat Clone — Performance Benchmarks"
  echo "  Timestamp: $TIMESTAMP"
  echo "  Target:    $BASE_URL"
  echo "  Mode:      $RUN_MODE"
  echo "=============================================="
  echo ""

  check_prereqs

  # Check services (non-fatal warning)
  check_services || true

  local ws_exit=0 api_exit=0 msg_exit=0

  # ─── WebSocket Connection Benchmark ─────────────────────────────────────
  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "ws" ]; then
    echo ""
    log "━━━ WebSocket Connection Benchmark ━━━"
    validate_script "/benchmarks/ws-connection-test.js" || true
    run_k6_test "ws-connection" "/benchmarks/ws-connection-test.js" || ws_exit=$?
  fi

  # ─── API Load Benchmark ─────────────────────────────────────────────────
  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "api" ]; then
    echo ""
    log "━━━ API Load Benchmark ━━━"
    validate_script "/benchmarks/api-load-test.js" || true
    run_k6_test "api-load" "/benchmarks/api-load-test.js" || api_exit=$?
  fi

  # ─── Message Throughput Benchmark ────────────────────────────────────────
  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "messages" ]; then
    echo ""
    log "━━━ Message Throughput Benchmark ━━━"
    validate_script "/benchmarks/message-throughput-test.js" || true
    run_k6_test "message-throughput" "/benchmarks/message-throughput-test.js" || msg_exit=$?
  fi

  # ─── Summary ─────────────────────────────────────────────────────────────
  echo ""
  echo "=============================================="
  echo "  Benchmark Run Complete"
  echo "=============================================="
  echo ""

  local total_failures=0
  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "ws" ]; then
    if [ $ws_exit -eq 0 ]; then
      ok "WebSocket connection benchmark: PASSED"
    else
      err "WebSocket connection benchmark: FAILED (exit=$ws_exit)"
      total_failures=$((total_failures + 1))
    fi
  fi

  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "api" ]; then
    if [ $api_exit -eq 0 ]; then
      ok "API load benchmark: PASSED"
    else
      err "API load benchmark: FAILED (exit=$api_exit)"
      total_failures=$((total_failures + 1))
    fi
  fi

  if [ "$RUN_MODE" = "all" ] || [ "$RUN_MODE" = "messages" ]; then
    if [ $msg_exit -eq 0 ]; then
      ok "Message throughput benchmark: PASSED"
    else
      err "Message throughput benchmark: FAILED (exit=$msg_exit)"
      total_failures=$((total_failures + 1))
    fi
  fi

  echo ""
  log "Results saved to: $RESULTS_DIR"
  echo ""

  if [ $total_failures -gt 0 ]; then
    err "$total_failures benchmark(s) failed thresholds"
    exit 1
  fi
}

main "$@"
