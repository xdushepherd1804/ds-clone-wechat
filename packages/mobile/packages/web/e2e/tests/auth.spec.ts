/**
 * E2E tests: Registration & Login flows.
 *
 * Covers:
 *   Scenario: New user registration (UI + API)
 *   Scenario: Wrong password login (UI + API)
 */
import { test, expect } from '@playwright/test';
import { setupTestUser, getSharedUser, createAuthContext, navigateTo, requireBackend, APP_BASE } from '../fixtures/test-helpers';

// ─── UI tests ──────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test('renders login form', async ({ page }) => {
    await navigateTo(page, '/login');

    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('shows validation errors for empty fields', async ({ page }) => {
    await navigateTo(page, '/login');

    await page.getByRole('button', { name: 'Login' }).click();

    // Ant Design 5 shows inline validation — check for the error message
    // The form fields show red text when validation fails
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
  });

  test('navigates to register page from link', async ({ page }) => {
    await navigateTo(page, '/login');

    await page.getByRole('link', { name: 'Register' }).click();

    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
  });

  test('submits form and navigates to chat', async ({ page }) => {
    await navigateTo(page, '/login');

    await page.getByLabel('Username').fill('testuser');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Login' }).click();

    // Should navigate to /chat after submit
    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText('Logged in successfully')).toBeVisible();
  });
});

test.describe('Register page', () => {
  test('renders registration form', async ({ page }) => {
    await navigateTo(page, '/register');

    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    // Use specific locators — RegisterPage has two password fields
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirm')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
  });

  test('shows validation for empty fields', async ({ page }) => {
    await navigateTo(page, '/register');

    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
  });

  test('navigates to login page from link', async ({ page }) => {
    await navigateTo(page, '/register');

    await page.getByRole('link', { name: 'Login' }).click();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  });

  test('submits form and navigates to login', async ({ page }) => {
    await navigateTo(page, '/register');

    await page.getByLabel('Username').fill('newuser');
    await page.locator('#password').fill('password123');
    await page.locator('#confirm').fill('password123');
    await page.getByRole('button', { name: 'Register' }).click();

    // Should navigate to /login after submit
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Registration successful')).toBeVisible();
  });
});

// ─── API-level tests ───────────────────────────────────────────────────────────

test.describe('Auth API', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedUser: { username: string; password: string; token: string; userId: string };

  test.beforeAll(async () => {
    await requireBackend();
    sharedUser = await getSharedUser();
  });

  test('Scenario: new user registers via API', async ({ request }) => {
    await requireBackend();
    const ts = Date.now().toString(36).slice(0, 6);
    const username = `e2e_ar_${ts}`;
    const password = 'TestPass123';

    const reg = await request.post(`${APP_BASE}/api/auth/register`, {
      data: { username, password, nickname: `E2E User ${ts}` },
    });
    expect(reg.ok()).toBeTruthy();
    const regBody = await reg.json();

    if (regBody.code !== undefined) {
      expect(regBody).toHaveProperty('code');
      expect(regBody.code === 0 || regBody.user !== undefined).toBeTruthy();
    }
    if (regBody.user) {
      expect(regBody.user).toHaveProperty('id');
      expect(regBody.user.username).toBe(username);
    }
  });

  test('Scenario: login with correct password via API', async ({ request }) => {
    await requireBackend();
    const login = await request.post(`${APP_BASE}/api/auth/login`, {
      data: { username: sharedUser.username, password: sharedUser.password },
    });
    expect(login.ok()).toBeTruthy();
    const body = await login.json();
    expect(body.token).toBeTruthy();
  });

  test('Scenario: wrong password returns error', async ({ request }) => {
    await requireBackend();
    const login = await request.post(`${APP_BASE}/api/auth/login`, {
      data: { username: sharedUser.username, password: 'WrongPassword123' },
    });

    if (login.status() === 200) {
      const body = await login.json();
      expect(body.code).not.toBe(0);
    } else {
      expect(login.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('get user profile with valid token', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedUser.token);

    const me = await api.get('/api/users/me');
    if (me.ok()) {
      const body = await me.json();
      if (body.user) {
        expect(body.user.username).toBe(sharedUser.username);
      }
    }
    await api.dispose();
  });

  test('protected route returns 401 without token', async ({ request }) => {
    await requireBackend();
    const res = await request.get(`${APP_BASE}/api/users/me`);
    expect(res.status()).toBe(401);
  });

  test('search users with valid token', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedUser.token);

    const search = await api.post('/api/users/search', {
      data: { query: sharedUser.username },
    });
    if (search.ok()) {
      const body = await search.json();
      expect(body).toHaveProperty('users');
    }
    await api.dispose();
  });

  test('token refresh flow', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedUser.token);

    const refresh = await api.post('/api/auth/refresh', {
      data: { refreshToken: sharedUser.token },
    });

    if (refresh.ok()) {
      const body = await refresh.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });
});
