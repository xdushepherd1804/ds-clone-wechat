/**
 * WebSocket Connection Benchmark (k6)
 *
 * Tests concurrent WebSocket connection establishment, heartbeat handling,
 * and connection churn under load.
 *
 * Usage:
 *   k6 run benchmarks/ws-connection-test.js
 *
 *   With overrides:
 *   k6 run -e BASE_URL=http://localhost:3000 -e VUS=100 -e DURATION=60s benchmarks/ws-connection-test.js
 *
 *   Via Docker:
 *   docker run --rm -i grafana/k6 run -e BASE_URL=http://host.docker.internal:3000 - < benchmarks/ws-connection-test.js
 *
 * Targets:
 *   - 10K concurrent connections established in < 200ms (p99)
 *   - Memory usage < 2GB under full load
 *   - No connection failures
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { setupTestUsers } from './helpers/auth.js';

// ─── Configurable parameters ───────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '100', 10);
const DURATION = __ENV.DURATION || '60s';
const WS_STAGES = parseInt(__ENV.WS_STAGES || '5', 10);  // Ramp-up stages

// ─── Custom metrics ────────────────────────────────────────────────────────
const wsConnectTime = new Trend('ws_connect_time', true);
const wsConnectErrors = new Counter('ws_connect_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsMessageLatency = new Trend('ws_message_latency', true);
const wsHeartbeatSuccess = new Rate('ws_heartbeat_success');

// ─── Test configuration ────────────────────────────────────────────────────
export const options = {
  stages: Array.from({ length: WS_STAGES }, (_, i) => ({
    duration: `${Math.floor(parseInt(DURATION) / WS_STAGES)}s`,
    target: Math.floor(((i + 1) / WS_STAGES) * VUS),
  })),
  thresholds: {
    ws_connect_time: ['p(99)<200'],   // p99 connection time under 200ms
    ws_connect_errors: ['count<5'],     // fewer than 5 connection errors
  },
};

// ─── Setup: create test users and get tokens ───────────────────────────────
export function setup() {
  const userCount = Math.min(VUS, 100); // Register up to 100 users for reuse
  return setupTestUsers(userCount, 'wsbench');
}

// ─── VU code ───────────────────────────────────────────────────────────────
export default function (data) {
  const { users, baseUrl } = data;
  if (!users || users.length === 0) {
    console.error('No test users available');
    return;
  }

  // Round-robin user assignment
  const userIdx = (__VU - 1) % users.length;
  const user = users[userIdx];
  const token = user.token;

  // Build WS URL from base HTTP URL
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/ws?token=${token}`;

  const connectStart = Date.now();

  const socket = ws.connect(wsUrl, null, function (socket) {
    // Track connection time
    wsConnectTime.add(Date.now() - connectStart);

    socket.on('open', () => {
      // Send an initial heartbeat to confirm the connection is alive
      socket.send(JSON.stringify({
        cmd: 'heartbeat',
        seq: Date.now(),
        body: {},
      }));
    });

    socket.on('message', (msg) => {
      wsMessagesReceived.add(1);

      try {
        const parsed = JSON.parse(msg);
        // Measure heartbeat roundtrip latency
        if (parsed.cmd === 'ack' && parsed.body?.type === 'heartbeat') {
          const latency = Date.now() - parsed.body.timestamp;
          wsMessageLatency.add(latency);
          wsHeartbeatSuccess.add(1);
        }
      } catch {
        // ignore non-JSON or malformed messages
      }
    });

    socket.on('close', () => {
      // Connection closed — counted via ws_connect_errors if unexpected
    });

    socket.on('error', () => {
      wsConnectErrors.add(1);
    });

    // Send periodic heartbeats to keep the connection alive
    socket.setInterval(() => {
      if (socket.readyState === 1) { // OPEN
        socket.send(JSON.stringify({
          cmd: 'heartbeat',
          seq: Date.now(),
          body: {},
        }));
      }
    }, 25000); // every 25s (server pings at 30s)
  });

  // Each VU holds the connection for a random duration within the test window
  const holdTime = Math.random() * parseInt(DURATION) * 0.8;
  sleep(holdTime > 5 ? holdTime : 5);

  // Gracefully close
  if (socket) {
    socket.close();
  }
}

// ─── Teardown ──────────────────────────────────────────────────────────────
export function teardown(data) {
  console.log(`WebSocket benchmark complete. ${data.users?.length || 0} users tested.`);
}

// ─── Summary output ────────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'websocket_connection',
    configuration: {
      base_url: BASE_URL,
      virtual_users: VUS,
      duration: DURATION,
      ws_stages: WS_STAGES,
    },
    metrics: {
      connections: {
        total_attempted: data.metrics.ws_connect_time?.values?.count || 0,
        errors: data.metrics.ws_connect_errors?.values?.count || 0,
        connect_time_ms: {
          avg: data.metrics.ws_connect_time?.values?.avg || 0,
          p50: data.metrics.ws_connect_time?.values?.['p(50)'] || 0,
          p90: data.metrics.ws_connect_time?.values?.['p(90)'] || 0,
          p95: data.metrics.ws_connect_time?.values?.['p(95)'] || 0,
          p99: data.metrics.ws_connect_time?.values?.['p(99)'] || 0,
          max: data.metrics.ws_connect_time?.values?.max || 0,
        },
      },
      messages: {
        received: data.metrics.ws_messages_received?.values?.count || 0,
        heartbeat_success_rate: data.metrics.ws_heartbeat_success?.values?.rate || 0,
        heartbeat_latency_ms: {
          avg: data.metrics.ws_message_latency?.values?.avg || 0,
          p99: data.metrics.ws_message_latency?.values?.['p(99)'] || 0,
        },
      },
    },
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'benchmarks/results/ws-connection-summary.json': JSON.stringify(summary, null, 2),
  };
}
