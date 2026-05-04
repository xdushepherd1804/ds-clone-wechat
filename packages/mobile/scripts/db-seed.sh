#!/usr/bin/env bash
# =============================================================================
# db-seed.sh — Seed the database with sample data
#
# Usage:
#   ./scripts/db-seed.sh                # run Prisma seed
#   ./scripts/db-seed.sh --mongo       # initialize MongoDB indexes
#
# Requires: Database containers to be running
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

COMPOSE_ENV="docker/.env"
if [[ -f "$COMPOSE_ENV" ]]; then
  export $(grep -v '^#' "$COMPOSE_ENV" | grep -v '^$' | xargs)
fi

DATABASE_URL="${DATABASE_URL:-postgresql://wechat:wechat_dev@localhost:5432/wechat?schema=public}"
MONGODB_URL="${MONGODB_URL:-mongodb://wechat:wechat_dev@localhost:27017/wechat?authSource=admin}"

echo "=============================================="
echo "  WeChat Clone — Database Seeding"
echo "=============================================="

MODE="${1:-}"

case "$MODE" in
  --mongo)
    echo "  → Initializing MongoDB indexes..."
    docker compose run --rm \
      -e MONGODB_URL="$MONGODB_URL" \
      auth npx tsx scripts/mongo-init.ts
    echo "  ✓ MongoDB indexes created"
    ;;
  *)
    echo "  → Running Prisma seed..."
    docker compose run --rm \
      -e DATABASE_URL="$DATABASE_URL" \
      auth sh -c 'cd /app && npx prisma db seed --schema=packages/shared/prisma/schema.prisma'
    echo "  ✓ Prisma seed complete"
    ;;
esac

echo "  ✓ Done"
