#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="$ROOT/packages/web"
RESULTS_DIR="$E2E_DIR/e2e/results"

# Parse args
HEADED=false
SPEC=""
BROWSER=""
CLEANUP=true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --headed) HEADED=true; shift ;;
    --spec) SPEC="$2"; shift 2 ;;
    --browser) BROWSER="$2"; shift 2 ;;
    --no-cleanup) CLEANUP=false; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[e2e]${NC} $*"; }
warn() { echo -e "${YELLOW}[e2e]${NC} $*"; }
err()  { echo -e "${RED}[e2e]${NC} $*"; }

cleanup() {
  if $CLEANUP; then
    log "Cleaning up..."
  fi
}
trap cleanup EXIT

# ─── Infrastructure ─────────────────────────────────────────────────────────────
INFRA_UP=false
start_infra() {
  if docker compose -f "$ROOT/docker/docker-compose.yml" ps --services --status running 2>/dev/null | grep -q 'postgres\|redis\|mongo'; then
    log "Infrastructure already running"
    return
  fi
  log "Starting infrastructure (PostgreSQL, Redis, MongoDB)..."
  if ! docker compose -f "$ROOT/docker/docker-compose.yml" up -d --wait 2>/dev/null; then
    warn "Could not start Docker infrastructure — API tests may fail"
    warn "Ensure PostgreSQL, Redis, MongoDB are running"
  else
    INFRA_UP=true
  fi
}

stop_infra() {
  if $INFRA_UP; then
    log "Stopping infrastructure..."
    docker compose -f "$ROOT/docker/docker-compose.yml" down 2>/dev/null || true
  fi
}

# ─── Database setup ─────────────────────────────────────────────────────────────
setup_db() {
  log "Running database migrations..."
  cd "$ROOT/packages/shared"
  if npx prisma migrate deploy 2>/dev/null; then
    log "Migrations applied"
  else
    warn "Could not apply migrations — continuing anyway"
  fi
  cd "$ROOT"
}

# ─── Main ────────────────────────────────────────────────────────────────────────
main() {
  log "========================================="
  log "  E2E Tests — WeChat Clone"
  log "========================================="

  # Ensure dependencies
  if [[ ! -d "$ROOT/node_modules" ]]; then
    log "Installing dependencies..."
    cd "$ROOT" && pnpm install
  fi

  # Ensure Playwright browsers
  if [[ ! -d "$HOME/Library/Caches/ms-playwright" ]] && [[ ! -d "$HOME/.cache/ms-playwright" ]]; then
    log "Installing Playwright browsers..."
    cd "$E2E_DIR" && npx playwright install chromium firefox
  fi

  # Start infrastructure
  start_infra
  trap 'stop_infra; cleanup' EXIT

  # Setup database
  setup_db

  # Clear previous results
  rm -rf "$RESULTS_DIR"
  mkdir -p "$RESULTS_DIR"

  # Build Playwright args
  PW_ARGS="--config=$E2E_DIR/playwright.config.ts"
  if $HEADED; then
    PW_ARGS="$PW_ARGS --headed"
  fi
  if [[ -n "$SPEC" ]]; then
    PW_ARGS="$PW_ARGS $SPEC"
  fi
  if [[ -n "$BROWSER" ]]; then
    PW_ARGS="$PW_ARGS --project=$BROWSER"
  fi

  log "Running Playwright tests..."
  log "Command: npx playwright test $PW_ARGS"

  cd "$E2E_DIR"
  set +e
  npx playwright test $PW_ARGS
  EXIT_CODE=$?
  set -e

  # Show results
  log "========================================="
  if [[ $EXIT_CODE -eq 0 ]]; then
    log "All E2E tests passed!"
  else
    err "Some E2E tests failed (exit code: $EXIT_CODE)"
  fi

  log "Report: file://$E2E_DIR/e2e/results/report/index.html"
  log "Artifacts: $E2E_DIR/e2e/results/artifacts/"

  stop_infra

  exit $EXIT_CODE
}

main "$@"
