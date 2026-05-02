# CLAUDE.md

## Project
WeChat clone — full-stack messaging platform monorepo (pnpm workspaces).

## Commands
- `pnpm dev` — start web dev server (port 5173, readable React errors)
- `pnpm test` — run vitest (unit + integration)
- `pnpm test:coverage` — run with coverage
- `pnpm typecheck` — tsc --build across all packages
- `pnpm lint` / `pnpm format` — ESLint / Prettier

## Infrastructure
- `docker compose up -d` — start all services (DBs + microservices + web)
- `docker compose up -d --build <svc>` — rebuild & restart one service
- `docker compose logs <svc>` — view service logs

## Packages
- `packages/web` — React frontend (antd, react-router-dom)
- `packages/server-*` — backend microservices (gateway, auth, message, contact, group, search, push, file, moments, qrcode, redpacket)
- `packages/shared` — shared types, config, utilities
- `config/` — shared server configuration
- `docker/` — nginx config for SPA routing

## Feature Development Workflow

### Starting Feature Work
When starting a new feature or fix (user says "let's build X", "implement X", etc.):

1. **Enter a worktree**: Call `EnterWorktree` with a descriptive branch name:
   - Format: `feat/TXXX-short-description` or `fix/TXXX-short-description`
   - Example: `EnterWorktree(name: "feat/T004-user-auth")`

2. **Write feature context**: After entering the worktree, run:
   ```
   bash .claude/scripts/feature-context.sh \
     --title "feat: add user authentication service" \
     --desc "Implement JWT auth with login/register, session management" \
     --task T004
   ```
   This writes `.claude/feature-context.json` which drives the PR creation on stop.

3. **Do the work** inside the worktree. Make intermediate commits freely.

4. **When done**: The **Stop hook** auto-commits pending changes, pushes the branch, creates a PR to main, and removes the worktree. No manual cleanup needed.

### Quick Fixes (no worktree)
- Work directly on the current branch without calling `EnterWorktree`
- The Stop hook auto-commits but does not push or create a PR

### Abandoning a Feature
If the user decides to drop the current feature:
```
bash .claude/scripts/feature-context.sh \
  --title "feat: ..." \
  --desc "..." \
  --status abandoned
```
Then call `ExitWorktree(action: "remove", discard_changes: true)`.

### Hooks
- **SessionStart**: Pulls latest `main`, writes session state
- **Stop**: Path A (worktree + context) — commits, pushes, creates PR, cleans up worktree. Path B — auto-commit only.

## Stack
TypeScript 5.7, React 19, pnpm 9, Vitest 3, ESLint flat config, Docker Compose dev environment

## Import Rules (shared package)
- DB modules (redis-keys, mongo-indexes) are NOT re-exported from the barrel to keep it browser-safe
- Server code must import directly: `import { RedisKeys } from '@wechat-clone/shared/db/redis-keys'`
- Shared code using `process.env` must guard with `typeof process !== 'undefined'`

## Zustand Pattern
- Never `|| []` in selectors — creates new array ref each render causing infinite loops
- Use `?? EMPTY_CONST` with a module-level constant instead

## Gateway Routing
- Gateway strips matched route prefix: `POST /api/messages` → service receives `POST /`
- Service `matchRoute` must handle the bare `/` path for prefix-matched routes

## API Response Safety
- `res.data.data!` returns `undefined` when the server response lacks a `data` field
  (skeleton servers, gateway errors, etc.) — always guard before storing: `if (item && item.id)`
- Use `Promise.allSettled` for independent parallel API calls so one failure doesn't drop all data

## Rendering Safety
- When mapping array state that may contain corrupt entries (e.g., from a broken API),
  use `.filter(Boolean).map(...)` instead of bare `.map(...)` to prevent render crashes

## Known Issues
- `docker-compose.yml`: message service needs `DATABASE_URL` env var for Prisma (PostgreSQL user lookups)
