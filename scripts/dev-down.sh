#!/usr/bin/env bash
# =============================================================================
# dev-down.sh — Stop the development environment
#
# Usage:
#   ./scripts/dev-down.sh            # stop all services, keep volumes
#   ./scripts/dev-down.sh --clean    # stop and remove volumes (WARNING: data loss)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=============================================="
echo "  WeChat Clone — Stopping Environment"
echo "=============================================="

CLEAN_FLAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clean)
      CLEAN_FLAG="--volumes"
      echo "  ⚠  WARNING: This will remove ALL persistent data!"
      echo "  → Press Ctrl-C within 5s to cancel..."
      sleep 5
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--clean]"
      exit 1
      ;;
  esac
done

echo "  → Stopping services..."
docker compose down $CLEAN_FLAG

echo "  ✓ All services stopped"
