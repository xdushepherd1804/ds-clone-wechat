/**
 * Shared authentication helper for k6 benchmark scripts.
 *
 * Provides a setup function that registers test users and logs them in,
 * returning JWT tokens that the test phase can use.
 */

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Register a batch of test users and return their credentials + tokens.
 * Each user gets a unique username so tests can be repeated.
 */
export function setupTestUsers(count, prefix = 'bench') {
  const timestamp = Date.now();
  const users = [];

  for (let i = 0; i < count; i++) {
    const username = `${prefix}_${timestamp}_${i}`;
    const password = 'TestPass123!';
    const nickname = `BenchUser${i}`;

    // Register
    const regRes = http.post(`${BASE_URL}/api/auth/register`, JSON.stringify({
      username,
      password,
      nickname,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    check(regRes, {
      [`register ${username} ok`]: (r) => r.status === 201 || r.status === 200,
    });

    // Login
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      username,
      password,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    const loginOk = check(loginRes, {
      [`login ${username} ok`]: (r) => r.status === 200,
    });

    if (loginOk) {
      const body = JSON.parse(loginRes.body);
      users.push({
        username,
        password,
        nickname,
        token: body.token,
        userId: body.user?.id,
      });
    }
  }

  return { users, timestamp, baseUrl: BASE_URL };
}

/**
 * Login a single existing user and return the token.
 */
export function loginUser(baseUrl, username, password) {
  const res = http.post(`${baseUrl}/api/auth/login`, JSON.stringify({
    username,
    password,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, { 'login ok': (r) => r.status === 200 });
  const body = JSON.parse(res.body);
  return body.token;
}
