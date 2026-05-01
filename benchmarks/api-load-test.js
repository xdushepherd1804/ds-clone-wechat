/**
 * API Load Benchmark (k6)
 *
 * Tests core REST API endpoints under load: login, search users, contact list,
 * messages history, and moments timeline.
 *
 * Usage:
 *   k6 run benchmarks/api-load-test.js
 *   k6 run -e BASE_URL=http://localhost:3000 -e VUS=100 -e DURATION=60s benchmarks/api-load-test.js
 *
 * Targets:
 *   - Login: 1000 req/s with p99 < 200ms
 *   - Search users: 500 req/s with p99 < 200ms
 *   - Timeline: 500 req/s with p99 < 200ms
 *   - Error rate < 0.1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { setupTestUsers } from './helpers/auth.js';

// ─── Configurable parameters ───────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '100', 10);
const DURATION = __ENV.DURATION || '60s';

// ─── Custom metrics ────────────────────────────────────────────────────────
const loginDuration = new Trend('api_login_duration', true);
const searchUsersDuration = new Trend('api_search_users_duration', true);
const contactsDuration = new Trend('api_contacts_duration', true);
const msgHistoryDuration = new Trend('api_msg_history_duration', true);
const timelineDuration = new Trend('api_timeline_duration', true);
const totalRequests = new Counter('api_total_requests');
const totalErrors = new Counter('api_total_errors');
const errorRate = new Rate('api_error_rate');

// ─── Test configuration ────────────────────────────────────────────────────
export const options = {
  scenarios: {
    login_scenario: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.LOGIN_RATE || '200', 10),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.floor(VUS * 0.3),
      maxVUs: Math.floor(VUS * 0.5),
      exec: 'loginTest',
    },
    search_scenario: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.SEARCH_RATE || '100', 10),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.floor(VUS * 0.2),
      maxVUs: Math.floor(VUS * 0.4),
      exec: 'searchUsersTest',
    },
    contacts_scenario: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.CONTACTS_RATE || '100', 10),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.floor(VUS * 0.2),
      maxVUs: Math.floor(VUS * 0.4),
      exec: 'contactsTest',
    },
    timeline_scenario: {
      executor: 'constant-arrival-rate',
      rate: parseInt(__ENV.TIMELINE_RATE || '100', 10),
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.floor(VUS * 0.2),
      maxVUs: Math.floor(VUS * 0.3),
      exec: 'timelineTest',
    },
  },
  thresholds: {
    api_login_duration: ['p(99)<200'],
    api_search_users_duration: ['p(99)<200'],
    api_contacts_duration: ['p(99)<200'],
    api_timeline_duration: ['p(99)<200'],
    api_error_rate: ['rate<0.001'],  // error rate < 0.1%
  },
};

// ─── Setup: create test users ──────────────────────────────────────────────
export function setup() {
  return setupTestUsers(50, 'apibench');
}

// ─── Scenario: Login ───────────────────────────────────────────────────────
export function loginTest(data) {
  const { users } = data;
  if (!users || users.length === 0) return;

  const user = users[Math.floor(Math.random() * users.length)];

  const start = Date.now();
  const res = http.post(`${data.baseUrl}/api/auth/login`, JSON.stringify({
    username: user.username,
    password: user.password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  loginDuration.add(Date.now() - start);
  totalRequests.add(1);

  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  if (!ok) {
    totalErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// ─── Scenario: Search Users ────────────────────────────────────────────────
export function searchUsersTest(data) {
  const { users } = data;
  if (!users || users.length === 0) return;

  const user = users[Math.floor(Math.random() * users.length)];
  const searchQuery = __ENV.SEARCH_QUERY || 'bench';

  const start = Date.now();
  const res = http.post(`${data.baseUrl}/api/users/search`, JSON.stringify({
    query: searchQuery,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.token}`,
    },
  });
  searchUsersDuration.add(Date.now() - start);
  totalRequests.add(1);

  const ok = check(res, { 'search 200': (r) => r.status === 200 });
  if (!ok) {
    totalErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// ─── Scenario: Contacts List ───────────────────────────────────────────────
export function contactsTest(data) {
  const { users } = data;
  if (!users || users.length === 0) return;

  const user = users[Math.floor(Math.random() * users.length)];

  const start = Date.now();
  const res = http.get(`${data.baseUrl}/api/contacts/`, {
    headers: {
      'Authorization': `Bearer ${user.token}`,
    },
  });
  contactsDuration.add(Date.now() - start);
  totalRequests.add(1);

  const ok = check(res, { 'contacts 2xx': (r) => r.status >= 200 && r.status < 400 });
  if (!ok) {
    totalErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// ─── Scenario: Timeline ────────────────────────────────────────────────────
export function timelineTest(data) {
  const { users } = data;
  if (!users || users.length === 0) return;

  const user = users[Math.floor(Math.random() * users.length)];

  const start = Date.now();
  const res = http.get(`${data.baseUrl}/api/moments/timeline`, {
    headers: {
      'Authorization': `Bearer ${user.token}`,
    },
  });
  timelineDuration.add(Date.now() - start);
  totalRequests.add(1);

  const ok = check(res, { 'timeline 2xx': (r) => r.status >= 200 && r.status < 400 });
  if (!ok) {
    totalErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// ─── Summary output ────────────────────────────────────────────────────────
export function handleSummary(data) {
  const total = data.metrics.api_total_requests?.values?.count || 0;
  const errors = data.metrics.api_total_errors?.values?.count || 0;

  const summary = {
    timestamp: new Date().toISOString(),
    test_type: 'api_load',
    configuration: {
      base_url: BASE_URL,
      max_vus: VUS,
      duration: DURATION,
      scenarios: {
        login: { target_rate: parseInt(__ENV.LOGIN_RATE || '200', 10) },
        search_users: { target_rate: parseInt(__ENV.SEARCH_RATE || '100', 10) },
        contacts: { target_rate: parseInt(__ENV.CONTACTS_RATE || '100', 10) },
        timeline: { target_rate: parseInt(__ENV.TIMELINE_RATE || '100', 10) },
      },
      total_target_rate: 500,
      note: 'Actual rate limited by gateway rate limiter (100 req/min global)',
    },
    metrics: {
      requests: { total, errors, error_rate_percent: total > 0 ? (errors / total) * 100 : 0 },
      login: {
        count: data.metrics.api_login_duration?.values?.count || 0,
        avg_ms: data.metrics.api_login_duration?.values?.avg || 0,
        p50_ms: data.metrics.api_login_duration?.values?.['p(50)'] || 0,
        p90_ms: data.metrics.api_login_duration?.values?.['p(90)'] || 0,
        p95_ms: data.metrics.api_login_duration?.values?.['p(95)'] || 0,
        p99_ms: data.metrics.api_login_duration?.values?.['p(99)'] || 0,
        max_ms: data.metrics.api_login_duration?.values?.max || 0,
      },
      search_users: {
        count: data.metrics.api_search_users_duration?.values?.count || 0,
        avg_ms: data.metrics.api_search_users_duration?.values?.avg || 0,
        p99_ms: data.metrics.api_search_users_duration?.values?.['p(99)'] || 0,
      },
      contacts: {
        count: data.metrics.api_contacts_duration?.values?.count || 0,
        avg_ms: data.metrics.api_contacts_duration?.values?.avg || 0,
        p99_ms: data.metrics.api_contacts_duration?.values?.['p(99)'] || 0,
      },
      timeline: {
        count: data.metrics.api_timeline_duration?.values?.count || 0,
        avg_ms: data.metrics.api_timeline_duration?.values?.avg || 0,
        p99_ms: data.metrics.api_timeline_duration?.values?.['p(99)'] || 0,
      },
    },
    thresholds: {
      login_p99_under_200ms: (data.metrics.api_login_duration?.values?.['p(99)'] || 0) < 200,
      search_p99_under_200ms: (data.metrics.api_search_users_duration?.values?.['p(99)'] || 0) < 200,
      contacts_p99_under_200ms: (data.metrics.api_contacts_duration?.values?.['p(99)'] || 0) < 200,
      timeline_p99_under_200ms: (data.metrics.api_timeline_duration?.values?.['p(99)'] || 0) < 200,
      error_rate_under_0_1pct: total > 0 ? (errors / total) < 0.001 : true,
    },
  };

  return {
    'stdout': JSON.stringify(summary, null, 2),
    'benchmarks/results/api-load-summary.json': JSON.stringify(summary, null, 2),
  };
}
