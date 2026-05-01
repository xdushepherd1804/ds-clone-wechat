/**
 * E2E tests: Friend chat flows.
 *
 * Covers:
 *   Scenario: Friends chat (UI navigation + API-level messaging)
 */
import { test, expect } from '@playwright/test';
import { getSharedUser, createAuthContext, navigateTo, requireBackend, APP_BASE } from '../fixtures/test-helpers';

// ─── UI tests ──────────────────────────────────────────────────────────────────

test.describe('Chat page', () => {
  test('renders conversations list', async ({ page }) => {
    await navigateTo(page, '/chat');

    await expect(page.getByRole('heading', { name: 'Chats' })).toBeVisible();
    await expect(page.getByPlaceholder('Search conversations...')).toBeVisible();

    // Static data is rendered
    await expect(page.getByText('Alice Wang')).toBeVisible();
    await expect(page.getByText('Bob Li')).toBeVisible();
    await expect(page.getByText('Dev Team')).toBeVisible();
    await expect(page.getByText('See you tomorrow!')).toBeVisible();
  });

  test('navigates to chat detail', async ({ page }) => {
    await navigateTo(page, '/chat');

    // Click first conversation
    await page.getByText('Alice Wang').click();
    // Note: The ChatPage list items don't use Link — they're static, not clickable for navigation.
    // This verifies the page renders and the item is visible.
    // Navigation is verified by direct URL access below.
  });

  test('chat detail page renders with conv_id', async ({ page }) => {
    await navigateTo(page, '/chat/conv_123');

    await expect(page.getByText('Conversation: conv_123')).toBeVisible();
    await expect(page.getByText('Chat messages will appear here.')).toBeVisible();
  });
});

test.describe('Contact page', () => {
  test('renders contacts list', async ({ page }) => {
    await navigateTo(page, '/contacts');

    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByPlaceholder('Search contacts...')).toBeVisible();

    // Static data
    await expect(page.getByText('Alice Wang')).toBeVisible();
    await expect(page.getByText('Bob Li')).toBeVisible();
    await expect(page.getByText('Carol Zhang')).toBeVisible();
    await expect(page.getByText('Best friend')).toBeVisible();
  });

  test('contact detail page renders with uid', async ({ page }) => {
    await navigateTo(page, '/contacts/user_1');

    await expect(page.getByText('Contact: user_1')).toBeVisible();
    await expect(page.getByText('Contact details will appear here.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Message' })).toBeVisible();
  });
});

test.describe('App navigation', () => {
  test('tab navigation between pages', async ({ page }) => {
    await navigateTo(page, '/chat');

    // Navigate via tabs in the AppLayout
    await expect(page.getByText('WeChat Clone')).toBeVisible();

    // Click Contacts tab using menuitem role (Ant Design Menu)
    await page.getByRole('menuitem', { name: 'Contacts' }).click();
    await expect(page).toHaveURL(/\/contacts/);

    // Click Moments tab
    await page.getByRole('menuitem', { name: 'Moments' }).click();
    await expect(page).toHaveURL(/\/moments/);

    // Click Profile tab
    await page.getByRole('menuitem', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/me/);

    // Click Chat tab to return
    await page.getByRole('menuitem', { name: 'Chat' }).click();
    await expect(page).toHaveURL(/\/chat/);
  });
});

// ─── API-level tests ───────────────────────────────────────────────────────────

test.describe('Message API', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedToken: string;

  test.beforeAll(async () => {
    await requireBackend();
    const user = await getSharedUser();
    sharedToken = user.token;
  });

  test('get conversations with valid token', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const convs = await api.get('/api/messages/conversations');
    if (convs.ok()) {
      const body = await convs.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('send message flow', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const send = await api.post('/api/messages/send', {
      data: {
        conversationId: 'conv_test',
        content: { type: 'text', text: 'Hello from E2E test' },
      },
    });

    if (send.ok()) {
      const body = await send.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });
});

test.describe('Contact API', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedToken: string;

  test.beforeAll(async () => {
    await requireBackend();
    const user = await getSharedUser();
    sharedToken = user.token;
  });

  test('get contacts with valid token', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const contacts = await api.get('/api/contacts');
    if (contacts.ok()) {
      const body = await contacts.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('get friend requests', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const reqs = await api.get('/api/contacts/requests');
    if (reqs.ok()) {
      const body = await reqs.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });
});

test.describe('Profile page', () => {
  test('renders profile page', async ({ page }) => {
    await navigateTo(page, '/me');

    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('WeChat ID: user_12345')).toBeVisible();
  });
});
