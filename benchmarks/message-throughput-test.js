/**
 * Message Throughput Benchmark (k6)
 *
 * Tests end-to-end message sending throughput: sender sends a message,
 * it's proxied through the gateway to the message service, stored, and
 * potentially delivered via WebSocket to the recipient.
 *
 * Usage:
 *   k6 run benchmarks/message-throughput-test.js
 *   k6 run -e BASE_URL=http://localhost:3000 -e VUS=50 -e DURATION=120s benchmarks/message-throughput-test.js
 *
 * Targets:
 *   - 1000 msg/s throughput with p99 latency < 500ms
 *   - 0% message loss rate
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { setupTestUsers } from './helpers/auth.js';

// ─── Configurable parameters ───────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '50', 10);
const DURATION = __ENV.DURATION || '120s';
const MSG_INTERVAL = parseFloat(__ENV.MSG_INTERVAL || '0.5'); // seconds between messages per VU

// ─── Custom metrics ────────────────────────────────────────────────────────
const msgSendDuration = new Trend('msg_send_duration', true);
const msgE2ELatency = new Trend('msg_e2e_latency', true);
const msgSent = new Counter('msg_sent');
const msgReceived = new Counter('msg_received');
const msgErrors = new Counter('msg_errors');

// ─── Test configuration ────────────────────────────────────────────────────
export const options = {
  scenarios: {
    message_senders: {
      executor: 'ramping-vus',
      startVUs: Math.floor(VUS * 0.1),
      stages: [
        { duration: '30s', target: Math.floor(VUS * 0.5) },
        { duration: '30s', target: VUS },
        { duration: '30s', target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    msg_send_duration: ['p(99)<500'],            // p99 send latency under 500ms
    msg_errors: ['count<10'],                      // fewer than 10 errors
    'msg_sent': ['count>0'],                       // at least some messages sent
  },
};

// ─── Setup: create pairs of users (sender ↔ receiver) ─────────────────────
export function setup() {
  const pairCount = Math.min(Math.ceil(VUS / 2), 50);
  const allUsers = setupTestUsers(pairCount * 2, 'msgbench');
  const { users, baseUrl } = allUsers;

  // Pair users: even indices are senders, odd indices are receivers
  const pairs = [];
  for (let i = 0; i < users.length - 1; i += 2) {
    pairs.push({
      sender: users[i],
      receiver: users[i + 1],
    });
  }

  return { pairs, baseUrl };
}

// ─── VU code ───────────────────────────────────────────────────────────────
export default function (data) {
  const { pairs, baseUrl } = data;
  if (!pairs || pairs.length === 0) {
    console.error('No test user pairs available');
    return;
  }

  // Round-robin pair assignment
  const pairIdx = (__VU - 1) % pairs.length;
  const pair = pairs[pairIdx];

  const senderToken = pair.sender.token;
  const receiverId = pair.receiver.userId;

  // Connect receiver via WebSocket to track message delivery
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const wsUrl = `${wsBase}/ws?token=${pair.receiver.token}`;
  let wsSocket = null;

  wsSocket = ws.connect(wsUrl, null, function (socket) {
    socket.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.cmd === 'new_msg') {
          msgReceived.add(1);
        }
      } catch {
        // ignore
      }
    });

    socket.setInterval(() => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ cmd: 'heartbeat', seq: Date.now(), body: {} }));
      }
    }, 25000);
  });

  // Small delay to let WebSocket connect
  sleep(1);

  // Send messages at the configured interval
  const endTime = Date.now() + (parseInt(DURATION) * 1000) * 0.8;

  while (Date.now() < endTime) {
    const sendStart = Date.now();

    // Send message via HTTP API
    const res = http.post(`${baseUrl}/api/messages/send`, JSON.stringify({
      chatType: 'private',
      toUid: receiverId,
      msgType: 0,
      content: `benchmark message ${Date.now()} from ${pair.sender.username}`,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${senderToken}`,
      },
    });

    const duration = Date.now() - sendStart;
    msgSendDuration.add(duration);
    msgSent.add(1);

    const ok = check(res, {
      'message sent ok': (r) => r.status === 200 || r.status === 201,
    });

    if (!ok) {
      msgErrors.add(1);
    }

    sleep(MSG_INTERVAL);
  }

  // Cleanup
  if (wsSocket) {
    wsSocket.close();
  }
}

// ─── Summary output ────────────────────────────────────────────────────────
export function handleSummary(data) {
  const sent = data.metrics.msg_sent?.values?.count || 0;
  const received = data.metrics.msg_received?.values?.count || 0;
  const errors = data.metrics.msg_errors?.values?.count || 0;
  const lossRate = sent > 0 ? ((sent - received) / sent) * 100 : 0;

  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'message_throughput',
    configuration: {
      base_url: BASE_URL,
      max_vus: VUS,
      duration: DURATION,
      msg_interval_seconds: MSG_INTERVAL,
      expected_throughput_msg_per_sec: VUS / MSG_INTERVAL,
    },
    metrics: {
      messages: {
        sent,
        received_via_ws: received,
        errors,
        loss_rate_percent: lossRate,
      },
      latency_ms: {
        send_duration: {
          avg: data.metrics.msg_send_duration?.values?.avg || 0,
          p50: data.metrics.msg_send_duration?.values?.['p(50)'] || 0,
          p90: data.metrics.msg_send_duration?.values?.['p(90)'] || 0,
          p95: data.metrics.msg_send_duration?.values?.['p(95)'] || 0,
          p99: data.metrics.msg_send_duration?.values?.['p(99)'] || 0,
          max: data.metrics.msg_send_duration?.values?.max || 0,
        },
      },
    },
    thresholds: {
      'p99_send_latency_under_500ms': (data.metrics.msg_send_duration?.values?.['p(99)'] || 0) < 500,
      'zero_loss': lossRate === 0,
    },
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'benchmarks/results/message-throughput-summary.json': JSON.stringify(summary, null, 2),
  };
}
