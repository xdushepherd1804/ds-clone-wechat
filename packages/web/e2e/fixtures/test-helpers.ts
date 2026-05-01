/**
 * E2E test helpers — shared utilities for Playwright tests.
 */
import { test, request, type APIRequestContext, type Page } from '@playwright/test';

// ─── Config ─────────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:3000';
const APP_BASE = 'http://localhost:5173';

// ─── Backend availability ───────────────────────────────────────────────────────

let _backendAvailable: boolean | null = null;

/**
 * Check if the API gateway is running by pinging /health.
 * Cached — only pings once per test run.
 */
export async function isBackendAvailable(): Promise<boolean> {
  if (_backendAvailable !== null) return _backendAvailable;
  try {
    const reqCtx = await request.newContext({ baseURL: API_BASE });
    const health = await reqCtx.get('/health', { timeout: 3000 });
    _backendAvailable = health.ok();
    await reqCtx.dispose();
  } catch {
    _backendAvailable = false;
  }
  return _backendAvailable;
}

/**
 * Call at the start of an API test to skip if the backend is not running.
 *
 * Usage:
 *   test('my api test', async () => {
 *     await requireBackend();
 *     // ... test logic
 *   });
 */
export async function requireBackend(): Promise<void> {
  if (!(await isBackendAvailable())) {
    test.skip(true, 'Backend API gateway is not available');
  }
}

// ─── Global shared test user (cached across test suites) ────────────────────────

let _sharedUser: { username: string; password: string; token: string; userId: string } | null = null;

/**
 * Get or create a single shared test user for all API tests.
 * Reduces rate limit pressure — only one register+login per test run.
 */
export async function getSharedUser(): Promise<{
  username: string;
  password: string;
  token: string;
  userId: string;
}> {
  if (_sharedUser) return _sharedUser;
  _sharedUser = await setupTestUser();
  return _sharedUser;
}

// ─── API helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an API context and register+login a test user.
 * Returns credentials + tokens for downstream tests.
 */
export async function setupTestUser(opts?: {
  username?: string;
  password?: string;
}): Promise<{
  username: string;
  password: string;
  token: string;
  userId: string;
}> {
  // Ensure username is ≤ 20 chars
  const ts = Date.now().toString(36).slice(0, 6);
  const username = opts?.username ?? `e2e_${ts}`;
  const password = opts?.password ?? 'TestPass123';

  const ctx = await request.newContext({ baseURL: API_BASE });

  // Register (through gateway, which requires /api/ prefix)
  // Retry up to 3 times with increasing delay for rate limiting
  let reg = await ctx.post('/api/auth/register', {
    data: { username, password, nickname: `E2E ${ts}` },
  });
  for (let retries = 0; reg.status() === 429 && retries < 3; retries++) {
    await new Promise((r) => setTimeout(r, 3000 * (retries + 1)));
    reg = await ctx.post('/api/auth/register', {
      data: { username, password, nickname: `E2E ${ts}` },
    });
  }
  if (!reg.ok()) {
    const body = await reg.json().catch(() => ({}));
    const code = (body as any).code;
    // 1100 = USERNAME_TAKEN, 2004 = username already registered
    // Both are fine — we can just login
    if (code !== 1100 && code !== 2004) {
      throw new Error(`Register failed: ${reg.status()} ${JSON.stringify(body)}`);
    }
  }

  // Login (through gateway) — with retry on rate limit
  let login = await ctx.post('/api/auth/login', {
    data: { username, password },
  });
  for (let retries = 0; login.status() === 429 && retries < 3; retries++) {
    await new Promise((r) => setTimeout(r, 3000 * (retries + 1)));
    login = await ctx.post('/api/auth/login', {
      data: { username, password },
    });
  }
  if (!login.ok()) {
    const body = await login.json().catch(() => ({}));
    throw new Error(`Login failed: ${login.status()} ${JSON.stringify(body)}`);
  }
  const loginBody: { token: string; user: { id: string } } = await login.json();
  await ctx.dispose();

  return {
    username,
    password,
    token: loginBody.token,
    userId: loginBody.user.id,
  };
}

/**
 * Create an authenticated API context for the given token.
 */
export async function createAuthContext(token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Set the JWT token in localStorage on a page (simulates login in browser).
 */
export async function loginViaStorage(page: Page, token: string): Promise<void> {
  await page.goto(`${APP_BASE}/`);
  await page.evaluate(
    (t) => localStorage.setItem('wechat_clone_token', t),
    token,
  );
}

/**
 * Navigate to a page and wait for Ant Design layout to render.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(`${APP_BASE}${path}`, { waitUntil: 'networkidle' });
}

export { API_BASE, APP_BASE };
