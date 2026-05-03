# Test & Quality Diagnostic Report
**Generated:** 2026-05-03
**Scope:** 17 failed test files (9 assertion failures), ~28 type errors, 572 lint errors

---

## P0 — Blocking Issues

### P0-1: NODE_ENV "test" Rejected by Config Loader (7 test files)
**Root Cause:** `packages/shared/src/config/loader.ts` — `resolveEnv()` validates `NODE_ENV` against `['development', 'staging', 'production']` only, rejecting `"test"` used by vitest.
**Files:** server-gateway, server-group, server-message, server-push, server-search, server-redpacket, server-file test suites.
**Fix:** Add `'test'` to valid environments list.

### P0-2: localStorage Not Available in jsdom (3 test files, 7+ tests)
**Root Cause:** `localStorage` mock missing in jsdom test environment. `token.test.ts` calls `localStorage.clear()` which fails. `userStore.ts` calls `getToken()` at module scope — crashes before tests run.
**Files:** token.test.ts, userStore.test.ts, useOnlineStatus.test.ts, ConnectionStatus.test.tsx
**Fix:** Add localStorage shim to `packages/web/src/test-setup.ts`.

### P0-3: Missing @prisma/client and ioredis Dependencies (3 packages)
**Root Cause:** server-contact, server-moments, server-push don't list `@prisma/client` or `ioredis` as dependencies.
**Fix:** Add missing deps to each package's package.json.

### P0-4: Missing firebase-admin Dependency
**File:** `packages/server-push/src/providers/fcm.provider.ts` — imports `firebase-admin` but not in package.json.

### P0-5: Deep Imports of `@wechat-clone/shared/db/redis-keys` Not Resolvable
**Root Cause:** Shared package lacks `exports` entry for `./db/redis-keys`.
**Affected:** server-message, server-moments, server-contact, server-push, server-redpacket.
**Fix:** Add exports entry to `packages/shared/package.json`.

---

## P1 — Important Issues

### P1-1: Stale Assertion — RedisKeyPatterns Count
**File:** `redis-keys.test.ts:122` — expects 9 but actual is 10 (redPacket added).

### P1-2: 401 Interceptor Mock Lifecycle Bug
**File:** `client.test.ts:121` — `removeToken` spy captured before `vi.resetModules()`, becomes orphaned.

### P1-3: RedPacket Algorithm Tolerance
**File:** `redpacket.service.test.ts:186` — flaky assertion, possible edge case.

### P1-4: ChatType String Literals (18 occurrences)
`Type '"private"' is not assignable to type 'ChatType'` across server-message.

### P1-5: String-to-Union Casts in server-push
**File:** `server.ts:321,385` — `as string` instead of `as PushScenario` / `as DevicePlatform`.

### P1-6: createdAt string vs Date in server-redpacket
**File:** `redpacket.service.ts:311` — `.toISOString()` converts Date to string but type expects Date.

### P1-7: Message Type Not Defined
**File:** `web/src/hooks/useMessageRead.ts:7` — `Message` type used but not imported.

### P1-8: server-group Missing mutedUntil
**File:** `group.service.ts:105` — `mapToGroupMember` omits `mutedUntil` from return.

---

## P2 — Improvements

- Tuple type unsoundness in gateway test (27 occurrences)
- ServicesConfig missing index signature (2 occurrences)
- Implicit `any` parameters (14 occurrences)
- `res._headers` typed as unknown (2 occurrences)

---

## Lint Errors (572 total)
- `@typescript-eslint/no-unused-vars` (~350 errors)
- `@typescript-eslint/no-explicit-any` (~222 errors)

---

## Recommended Fix Order

| Order | ID | Fix | Impact |
|-------|-----|-----|--------|
| 1 | P0-1 | Add `"test"` to valid NODE_ENV list | Unblocks 7 server test files |
| 2 | P0-2 | Add localStorage mock to test-setup.ts | Unblocks 3 web test files |
| 3 | P0-3/4 | Install missing deps in 3 packages | Fixes ~10 type errors |
| 4 | P0-5 | Add exports entry for `./db/redis-keys` | Fixes 5 TS2307 errors |
| 5 | P1-1/2/3 | Fix stale assertions + mock lifecycle | Fixes 3 test assertion failures |
| 6 | P1-4..8 | Fix type mismatches | Fixes ~20 type errors |
| 7 | P2 | Fix remaining TS issues | Fixes ~30 type errors |
| 8 | Lint | Remove unused code + type annotations | Cleans 572 lint errors |
