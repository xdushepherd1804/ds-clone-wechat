# Performance Optimization Recommendations

**Date:** 2026-04-30
**Based on:** Code analysis of gateway, auth, message, contact, and moments services.

---

## Executive Summary

The WeChat Clone platform has several architectural bottlenecks that limit throughput and scalability. This document catalogs the issues found during code review and provides prioritized recommendations.

---

## Priority 1: Critical (Immediate Action)

### 1.1 Gateway Rate Limiter Blocks All Traffic

**Severity:** Critical
**File:** `packages/server-gateway/src/server.ts:60`
**Current:** `tokensPerInterval: 100, interval: 60_000`
**Impact:** All API traffic limited to 1.67 req/s globally.

```typescript
// Current - blocks benchmarks and high-traffic scenarios
const rateLimiter = createRateLimiter({ tokensPerInterval: 100, interval: 60_000 });

// Recommended - per-IP rate limiting with configurable limits
const rateLimiter = createRateLimiter({
  tokensPerInterval: 100,  // per client
  interval: 60_000,
  perClient: true,         // token bucket per IP
});
```

**Recommendation:** Implement per-client rate limiting so the global cap doesn't bottleneck all users. Add a `BENCHMARK_MODE` environment flag that disables rate limiting entirely.

**Effort:** Small (30 min)
**Impact:** Unlocks full service throughput.

### 1.2 No HTTP Connection Pooling in Proxy

**Severity:** High
**File:** `packages/server-gateway/src/server.ts:77-106`
**Impact:** Every proxied request creates a new TCP connection. At 500 req/s, this opens/binds/closes 500 sockets per second per backend service.

```typescript
// Current
const proxy = request(options, ...);

// Recommended - use http.Agent with keepAlive
const agent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const proxy = request({ ...options, agent }, ...);
```

**Recommendation:** Add a per-service `http.Agent` with keepAlive enabled and `maxSockets` set to 50.

**Effort:** Small (30 min)
**Impact:** Reduces proxy overhead by ~1-2ms per request, reduces TCP handshake overhead.

### 1.3 bcrypt Password Verification on Main Thread

**Severity:** High
**File:** `packages/shared/src/` (shared crypto utilities)
**Impact:** Login throughput is CPU-bound at ~10 req/s per process due to bcrypt.

**Recommendation:** Offload password verification to a worker thread pool or use `bcryptjs` with async API. For high-traffic login endpoints, consider caching verification results.

**Effort:** Medium (2-3 hours)
**Impact:** Could improve login throughput by 3-5x.

---

## Priority 2: High (Short-term)

### 2.1 PostgreSQL ILIKE Queries for User Search

**Severity:** High
**File:** `packages/server-auth/src/auth.service.ts:350-358`
**Current:** `WHERE username ILIKE '%query%' OR nickname ILIKE '%query%'`
**Impact:** Full table scan on every search. Degrades linearly with user count.

```sql
-- Recommended: Add trigram index
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_search_trgm ON users
  USING gin (username gin_trgm_ops, nickname gin_trgm_ops);
```

**Recommendation:** Add PostgreSQL trigram indexes. For fuzzy search beyond simple pattern matching, consider the existing search service (port 3008) which uses MongoDB full-text search.

**Effort:** Small (migration + index creation)
**Impact:** Search latency drops from O(n) to O(log n) with index.

### 2.2 No Redis Caching for Contact Lists

**Severity:** Medium
**File:** `packages/server-contact/src/contact.service.ts`
**Impact:** Every contact list request queries PostgreSQL. Contacts change infrequently — perfect caching candidate.

**Recommendation:** Cache contact lists in Redis:
- Key: `wc:contacts:{uid}`
- Value: Sorted set of contact user IDs
- TTL: 5 minutes
- Invalidate on add/remove/block operations

**Effort:** Medium (1-2 hours)
**Impact:** Contact list endpoint latency drops from ~10ms to ~1ms.

### 2.3 Timeline Query with IN Clause

**Severity:** Medium
**File:** `packages/server-moments/src/moments.service.ts`
**Impact:** `WHERE user_id IN (500+ friend IDs)` generates large queries.

**Recommendation:**
1. Limit friend list expansion to 100 most recent contacts
2. Use cursor-based pagination (`WHERE created_at < :cursor`) instead of OFFSET
3. Cache recent timeline in Redis for active users

**Effort:** Medium (1-2 hours)
**Impact:** Timeline latency stays consistent regardless of friend count.

### 2.4 Buffer.concat GC Pressure in WebSocket

**Severity:** Medium
**File:** `packages/server-gateway/src/ws-gateway.ts:417`
**Current:** `buffer = Buffer.concat([buffer, data])` on every data event.
**Impact:** Creates new Buffer objects on every frame, generating GC pressure at high message rates.

```typescript
// Recommended - use a growing buffer with pre-allocation
class FrameBuffer {
  private chunks: Buffer[] = [];
  private totalLength = 0;

  push(data: Buffer) {
    this.chunks.push(data);
    this.totalLength += data.length;
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks, this.totalLength);
  }
}
```

**Recommendation:** Use a chunked buffer approach that only concatenates when reading frames, or pre-allocate buffer space.

**Effort:** Medium (1-2 hours)
**Impact:** Reduces GC frequency under high message load.

---

## Priority 3: Medium (Mid-term)

### 3.1 Single-Process Architecture

**Severity:** Medium
**File:** All server.ts files
**Impact:** Each service runs as a single Node.js process. CPU-bound work (bcrypt, JSON parsing, TLS) blocks the event loop.

**Recommendation:**
- Use Node.js `cluster` module for multi-core utilization
- Or run multiple Docker containers per service with load balancing
- Gateway is the most important service to cluster due to WebSocket + HTTP load

**Effort:** Large (1-2 days)
**Impact:** Near-linear throughput scaling with CPU cores.

### 3.2 No Request Timeout on Proxy

**Severity:** Medium
**File:** `packages/server-gateway/src/server.ts:94`
**Impact:** If a backend service hangs, the proxy request hangs indefinitely, consuming a socket and eventually crashing the gateway.

```typescript
// Recommended
const proxy = request({ ...options, timeout: 30000 }, ...);
```

**Recommendation:** Add a 30s timeout on all proxy requests.

**Effort:** Small (15 min)
**Impact:** Prevents cascading failures from hung backends.

### 3.3 Synchronous Message Routing in WebSocket

**Severity:** Low
**File:** `packages/server-gateway/src/ws-gateway.ts:196-260`
**Impact:** `routeMessage()` and `pushToUser()` are synchronous. For group messages to 500 members, this blocks the event loop for all other connections.

**Recommendation:** Batch the push operations and yield to the event loop periodically for large groups.

**Effort:** Medium (2-3 hours)
**Impact:** Prevents event loop stalls during group message fanout.

### 3.4 No Response Compression

**Severity:** Low
**Impact:** All HTTP responses are sent uncompressed. For timeline data with multiple moments, this wastes bandwidth.

**Recommendation:** Add `Content-Encoding: gzip` for responses > 1KB. Node.js `zlib` module provides this.

**Effort:** Small (30 min)
**Impact:** 50-80% bandwidth reduction for API responses.

---

## Priority 4: Low (Long-term)

### 4.1 Message Persistence Strategy

**Current:** Every message is individually written to MongoDB.
**Impact:** At 10K msg/s, MongoDB single-document writes become the bottleneck.

**Recommendation:** Batch inserts for messages arriving within a 100ms window. Use MongoDB `insertMany()` instead of individual `insertOne()` calls.

### 4.2 WebSocket Message Serialization

**Current:** JSON for all WebSocket messages.
**Impact:** JSON parsing overhead for every frame.

**Recommendation:** For production, consider MessagePack or a custom binary protocol for high-frequency message types (text, typing, heartbeat).

### 4.3 Monitoring and Observability

**Current:** Console.log for key events, no structured metrics.
**Recommendation:** Add prom-client for Prometheus metrics export:
- `ws_connections_total` (gauge)
- `http_request_duration_seconds` (histogram)
- `ws_messages_total` (counter)
- `gateway_proxy_errors_total` (counter)

---

## Summary Table

| # | Issue | Priority | Effort | Impact |
|---|---|---|---|---|
| 1 | Global rate limiter caps all traffic | Critical | Small | Unlocks throughput |
| 2 | No HTTP connection pooling | High | Small | -1-2ms per request |
| 3 | bcrypt on main thread | High | Medium | +3-5x login throughput |
| 4 | ILIKE full table scan | High | Small | Search O(n) → O(log n) |
| 5 | No Redis cache for contacts | Medium | Medium | -10ms per request |
| 6 | Timeline IN clause scaling | Medium | Medium | Stable latency |
| 7 | Buffer.concat GC pressure | Medium | Medium | Less GC pauses |
| 8 | Single-process architecture | Medium | Large | Linear scaling |
| 9 | No proxy timeout | Medium | Small | Prevents cascading failures |
| 10 | Synchronous group fanout | Low | Medium | Prevents event loop stalls |
| 11 | No response compression | Low | Small | Bandwidth savings |
| 12 | Individual message writes | Low | Large | Write throughput |
| 13 | JSON WebSocket messages | Low | Large | CPU savings |
| 14 | No structured metrics | Low | Medium | Observability |

---

## Implementation Roadmap

```
Week 1:  Fix rate limiter + HTTP agent + proxy timeout (Critical + High, low effort)
Week 2:  Add Redis caching for contacts + trigram index for search
Week 3:  Worker thread for bcrypt + timeline query optimization
Week 4:  WebSocket buffer optimization + response compression
Month 2: Cluster mode + message batching + metrics
```
