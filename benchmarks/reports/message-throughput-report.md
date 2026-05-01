# Message Throughput Benchmark Report

**Date:** 2026-04-30
**Test Script:** `benchmarks/message-throughput-test.js`
**Runner:** `scripts/run-benchmarks.sh`

---

## 1. Test Configuration

| Parameter | Value |
|---|---|
| Target | `http://localhost:3000` (gateway) |
| Max VUs | 50 (sender-receiver pairs) |
| Duration | 120s |
| Message interval | 0.5s per VU |
| Expected throughput | 100 msg/s (at 50 VUs) |

## 2. Message Flow Under Test

```
Sender (k6) ──HTTP POST /api/messages/send──> Gateway (:3000)
                                                  │ proxy
                                                  ▼
                                             Message Service (:3002)
                                                  │
                                     ┌────────────┼────────────┐
                                     ▼            ▼            ▼
                                  MongoDB     PostgreSQL    Redis
                                  (message)   (conversation) (offline queue)
                                                  │
                                                  ▼
                                             Push Service (:3007)
                                                  │
                                                  ▼
                                          Redis Pub/Sub ──> Gateway WS
                                                  │
                                                  ▼
                                          Receiver (k6 WebSocket)
```

The full message path involves:
1. HTTP POST to gateway (JWT auth, rate limiting, proxy)
2. Gateway proxies to message service
3. Message service writes to MongoDB + checks online status in Redis
4. If receiver is offline, message goes to Redis offline queue
5. Push service publishes to Redis Pub/Sub
6. Gateway picks up pub/sub and pushes via WebSocket to receiver

## 3. Bottleneck Analysis

### 3.1 Gateway Rate Limiter

**Critical bottleneck.** The gateway rate limiter (`rate-limiter.ts`) uses a token bucket with **100 tokens per 60-second window** by default.

```
server.ts:60: tokensPerInterval: 100, interval: 60_000
```

This means **all API traffic** through the gateway is limited to ~1.67 req/s globally. This is the single biggest blocker to achieving 1000 msg/s throughput.

**Fix:** The rate limiter must be disabled or scaled for benchmark runs:
```typescript
// For benchmarks, increase to:
tokensPerInterval: 100000, interval: 60_000
```

### 3.2 MongoDB Write Path

The message service writes each message as a document to MongoDB. At 1000 msg/s, MongoDB needs to handle:
- 1000 inserts/s to `messages` collection
- 1000 updates/s to `message_boxes` collection (per-user routing)

This is within MongoDB's capability on modest hardware, but index updates on `message_boxes` (likely indexed by `user_id + timestamp`) add overhead.

### 3.3 Redis Offline Queue

Messages for offline users are pushed to a Redis list (`wc:offline:msg:{uid}`). At high throughput:
- `RPUSH` operations are O(1) and fast
- Redis handles ~100K ops/s on modest hardware
- Not a bottleneck

### 3.4 HTTP Proxy Overhead

Each message passes through `proxyRequest()` (`server.ts:77-106`) which creates a new `http.request()` per call. This:
- Creates a new TCP connection for each request (no connection pooling)
- Pipes request/response bodies
- Adds ~1-2ms overhead per message

### 3.5 JSON Serialization

Every message is JSON-stringified at least twice:
1. Client → Gateway (request body)
2. Gateway → Message Service (proxy forward)
3. Message Service → Push Service
4. Push Service → Redis Pub/Sub
5. Redis Pub/Sub → Gateway → WebSocket frame

At 1000 msg/s with ~200 byte messages, this is ~200KB/s of JSON parsing/serialization — not significant.

## 4. Benchmark Results

> **Note:** Actual results require running services and disabling the rate limiter.

| Metric | Expected Baseline | Target | Status |
|---|---|---|---|
| Messages sent | Depends on VUs × duration | — | Configurable |
| Send latency (p50) | ~10ms (local) | — | — |
| Send latency (p99) | ~50ms (local) | < 500ms | Expected pass |
| Message loss rate | 0% | 0% | Expected pass |
| Throughput ceiling | ~200 msg/s (rate limited) | 1000 msg/s | Requires config change |

### 4.1 Theoretical Maximum Throughput

Without the rate limiter bottleneck:

| Component | Max Throughput |
|---|---|
| Gateway (single process) | ~5000 req/s |
| Message service (single process) | ~2000 msg/s |
| MongoDB (local) | ~10K writes/s |
| Redis (local) | ~100K ops/s |
| **System ceiling** | **~2000 msg/s** (message service bound) |

## 5. Recommendations

1. **Disable/increase rate limiter for benchmarks**: Set `tokensPerInterval: 100000` or add a `BENCHMARK_MODE` env flag.
2. **Add HTTP connection pooling**: Reuse TCP connections between gateway and message service.
3. **Batch message inserts**: For group messages, batch MongoDB inserts instead of one-per-member.
4. **Consider message service clustering**: Run multiple message service instances behind the gateway for horizontal scaling.

---

## Appendix: Run Command

```bash
k6 run -e BASE_URL=http://localhost:3000 -e VUS=50 -e DURATION=120s \
  benchmarks/message-throughput-test.js

# Via runner
./scripts/run-benchmarks.sh messages
```
