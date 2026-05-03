# Dev Fixes: P0 Issues Resolution

## Summary
Applied all 5 P0 (blocking) fixes per the test report. No P1/P2 changes made.

## Fixes Applied

### P0-1: Add "test" to NODE_ENV valid environment list
**File:** `packages/shared/src/config/loader.ts` (line 105)
**Change:** Added `'test'` to the valid environments array in `resolveEnv()`.
**Impact:** Unblocks 7 server test suites that vitest runs with `NODE_ENV=test`.

### P0-2: Add localStorage mock to test-setup
**File:** `packages/web/src/test-setup.ts` (lines 28-43)
**Change:** Added `LocalStorageMock` class implementing the `Storage` interface, polyfilled onto `globalThis.localStorage`.
**Note:** `packages/web/vitest.config.ts` already referenced this file in `setupFiles`, so no config change needed.
**Impact:** Unblocks 3 web test files (token.test.ts, userStore.test.ts, useOnlineStatus.test.ts, ConnectionStatus.test.tsx).

### P0-3: Install missing @prisma/client and ioredis dependencies
**Files:**
- `packages/server-contact/package.json` — added `@prisma/client: "^6.0.0"`, `ioredis: "^5.4.0"`
- `packages/server-moments/package.json` — added `@prisma/client: "^6.0.0"`, `ioredis: "^5.4.0"`
**Impact:** Fixes ~10 type errors in these packages.

### P0-4: Add firebase-admin dependency
**File:** `packages/server-push/package.json`
**Change:** Added `firebase-admin: "^13.0.0"` to dependencies.
**Impact:** Resolves missing module import in `fcm.provider.ts`.

### P0-5: Add shared package exports entry for ./db/redis-keys
**File:** `packages/shared/package.json`
**Change:** Added `"./db/redis-keys": "./src/db/redis-keys.ts"` to the exports map.
**Impact:** Fixes 5 TS2307 errors in server-message, server-moments, server-contact, server-push, server-redpacket that import `@wechat-clone/shared/db/redis-keys`.
