#!/usr/bin/env bash
# =============================================================================
# db-migrate.sh — Run database migrations in Docker
#
# Usage:
#   ./scripts/db-migrate.sh              # run Prisma migrations (dev)
#   ./scripts/db-migrate.sh --deploy     # deploy Prisma migrations (prod)
#   ./scripts/db-migrate.sh --status     # show migration status (raw SQL)
#   ./scripts/db-migrate.sh --up         # apply raw SQL migrations
#   ./scripts/db-migrate.sh --down       # rollback last raw SQL migration
#
# Requires: PostgreSQL container to be running (docker compose up -d postgres)
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

echo "=============================================="
echo "  WeChat Clone — Database Migration"
echo "=============================================="

MODE="${1:---status}"

case "$MODE" in
  --deploy)
    echo "  → Deploying Prisma migrations..."
    docker compose run --rm \
      -e DATABASE_URL="$DATABASE_URL" \
      auth sh -c 'cd /app/packages/shared && pnpm exec prisma migrate deploy'
    echo "  ✓ Prisma migrations deployed"
    ;;
  --status|--up|--down)
    echo "  → Running migration script: $MODE"
    docker compose run --rm \
      -e DATABASE_URL="$DATABASE_URL" \
      auth npx tsx scripts/migrate.ts "$MODE"
    ;;
  *)
    echo "  → Running Prisma migration (dev)..."
    docker compose run --rm \
      -e DATABASE_URL="$DATABASE_URL" \
      auth sh -c 'cd /app && pnpm exec prisma migrate dev --schema=packages/shared/prisma/schema.prisma'
    echo "  ✓ Prisma migration (dev) complete"
    ;;
esac

echo "  ✓ Done"
