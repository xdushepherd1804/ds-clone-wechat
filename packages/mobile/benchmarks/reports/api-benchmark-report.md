# API Load Benchmark Report

**Date:** 2026-04-30
**Test Script:** `benchmarks/api-load-test.js`
**Runner:** `scripts/run-benchmarks.sh`

---

## 1. Test Configuration

| Parameter | Value |
|---|---|
| Target | `http://localhost:3000` (gateway) |
| Max VUs | 100 |
| Duration | 60s |
| Scenarios | 4 concurrent (login, search, contacts, timeline) |

### 1.1 Scenario Details

| Scenario | Endpoint | Method | Auth | Target Rate |
|---|---|---|---|---|
| Login | `/api/auth/login` | POST | No | 200 req/s |
| Search Users | `/api/users/search` | POST | Yes | 100 req/s |
| Contacts | `/api/contacts/` | GET | Yes | 100 req/s |
| Timeline | `/api/moments/timeline` | GET | Yes | 100 req/s |
| **Total** | | | | **500 req/s** |

## 2. Request Flow Per Endpoint

### 2.1 Login (`POST /api/auth/login`)

```
Client → Gateway → Auth Service (:3001)
                       │
                       ├── Read user from PostgreSQL (unique index on username)
                       ├── bcrypt password verification (CPU-intensive)
                       ├── HS256 JWT signing
                       └── Redis session creation
```

**Bottleneck:** `bcrypt` password verification is CPU-intensive (~100ms per call). With limited Node.js threads, this caps login throughput at ~10 req/s per process.

### 2.2 Search Users (`POST /api/users/search`)

```
Client → Gateway → Auth Service (:3001)
                       │
                       ├── JWT authentication (already done by gateway)
                       └── PostgreSQL ILIKE query (username, nickname)
                           SELECT ... WHERE username ILIKE '%query%'
                           OR nickname ILIKE '%query%' LIMIT 50
```

**Bottleneck:** `ILIKE '%query%'` cannot use a B-tree index. Full table scan on the `users` table. At 10K+ users, queries become slow.

### 2.3 Contacts (`GET /api/contacts/`)

```
Client → Gateway → Contact Service (:3003)
                       │
                       └── PostgreSQL JOIN query
                           SELECT contacts.*, users.*
                           FROM contacts JOIN users ...
                           WHERE user_id = $1
```

**Bottleneck:** No Redis caching for contact lists. Every request hits PostgreSQL.

### 2.4 Timeline (`GET /api/moments/timeline`)

```
Client → Gateway → Moments Service (:3006)
                       │
                       ├── Get friend list (contact service? or direct DB)
                       └── PostgreSQL query for moments
                           SELECT * FROM moments
                           WHERE user_id IN (friend_ids)
                           ORDER BY created_at DESC LIMIT 20
```

**Bottleneck:** `WHERE user_id IN (...)` with large friend lists (500+) generates large queries. No pagination cursor optimization.

## 3. Gateway Bottlenecks

### 3.1 Rate Limiter (Critical)

```typescript
// server.ts:60
const rateLimiter = createRateLimiter({ tokensPerInterval: 100, interval: 60_000 });
```

**100 requests per 60 seconds** across all endpoints. This limits the entire API to **1.67 req/s**. Any benchmark will hit 429 errors immediately at the configured target rates.

### 3.2 HTTP Proxy per Request

Each proxied request creates a new TCP connection (`server.ts:94`):
```typescript
const proxy = request(options, ...);
```

No connection reuse or keepalive. At 500 req/s, this opens 500 TCP connections per second to backend services.

### 3.3 JWT Verification on Every Protected Request

`verifyJwt()` (`server.ts:183`) runs for every authenticated request. HS256 verification is fast (~0.1ms), but at 400 req/s, it adds up.

## 4. Benchmark Results

> **Note:** Actual results require running services and disabling the rate limiter.

| Endpoint | Expected p50 | Expected p99 | Target p99 | Status |
|---|---|---|---|---|
| Login | ~120ms | ~250ms | < 200ms | At risk (bcrypt) |
| Search Users | ~30ms (small DB) | ~150ms | < 200ms | Pass (small DB) |
| Contacts | ~10ms | ~50ms | < 200ms | Pass |
| Timeline | ~30ms | ~150ms | < 200ms | Pass |
| Error rate | ~99% (rate limited) | — | < 0.1% | Fail (rate limiter) |

### 4.1 PostgreSQL Query Performance Estimates

| Query | Without Index | With Index | Target |
|---|---|---|---|
| Login (username lookup) | ~1ms (unique index) | ~1ms | Fast |
| Password verify (bcrypt) | ~100ms | N/A | Slow |
| Search users (ILIKE) | ~50ms @ 1K rows | ~10ms (trigram) | Medium |
| Contact list (JOIN) | ~10ms @ 1K rows | ~5ms (composite index) | Fast |
| Timeline (IN query) | ~30ms @ 1K rows | ~10ms | Medium |

## 5. Recommendations

1. **Increase rate limiter for benchmarks**: Change `tokensPerInterval` to at least 10,000.
2. **Add HTTP keepalive to proxyRequest**: Reuse connections to backend services.
3. **Optimize password hashing**: Consider using `scrypt` with pre-computed parameters, or offload to a worker thread.
4. **Add pg_trgm index for search**: `CREATE INDEX idx_users_search ON users USING gin (username gin_trgm_ops, nickname gin_trgm_ops);`
5. **Cache contact lists in Redis**: `wc:contacts:{uid}` with 5-minute TTL.
6. **Use keyset pagination for timeline**: Replace `OFFSET/LIMIT` with cursor-based pagination.

---

## Appendix: Run Command

```bash
k6 run -e BASE_URL=http://localhost:3000 -e VUS=100 -e DURATION=60s \
  benchmarks/api-load-test.js

# Via runner
./scripts/run-benchmarks.sh api
```
