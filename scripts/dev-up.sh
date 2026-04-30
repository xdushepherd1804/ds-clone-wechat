#!/usr/bin/env bash
# =============================================================================
# dev-up.sh — Start the full development environment via Docker Compose
#
# Usage:
#   ./scripts/dev-up.sh              # start all services
#   ./scripts/dev-up.sh --build      # rebuild images before starting
#   ./scripts/dev-up.sh --no-deps    # start only infrastructure (DBs)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

COMPOSE_FILE="docker-compose.yml"
COMPOSE_ENV="docker/.env"

# Build compose env-file argument
COMPOSE_ENV_ARGS=""
if [[ -f "$COMPOSE_ENV" ]]; then
  COMPOSE_ENV_ARGS="--env-file $COMPOSE_ENV"
fi

echo "=============================================="
echo "  WeChat Clone — Development Environment"
echo "=============================================="

BUILD_FLAG=""
SERVICES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_FLAG="--build"
      echo "  → Will rebuild images before starting"
      shift
      ;;
    --no-deps)
      SERVICES="postgres redis mongo"
      echo "  → Starting infrastructure only (databases)"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--build] [--no-deps]"
      exit 1
      ;;
  esac
done

echo "  → Starting services..."
docker compose $COMPOSE_ENV_ARGS up -d $BUILD_FLAG $SERVICES

echo ""
echo "  ✓ Development environment started"
echo ""
echo "  Services:"
echo "    Frontend:        http://localhost:8080"
echo "    API Gateway:     http://localhost:3000"
echo "    PostgreSQL:      localhost:5432"
echo "    Redis:           localhost:6379"
echo "    MongoDB:         localhost:27017"
echo ""
echo "  Inspect: docker compose ps"
echo "  Logs:    docker compose logs -f [service]"
echo "  Stop:    ./scripts/dev-down.sh"
