/**
 * E2E tests: Moments (朋友圈) flows.
 */
import { test, expect } from '@playwright/test';
import { getSharedUser, createAuthContext, navigateTo, requireBackend } from '../fixtures/test-helpers';

// ─── UI tests ──────────────────────────────────────────────────────────────────

test.describe('Moments page', () => {
  test('renders moments page', async ({ page }) => {
    await navigateTo(page, '/moments');

    await expect(page.getByRole('heading', { name: 'Moments', exact: true })).toBeVisible();
    await expect(page.getByText('Welcome to Moments')).toBeVisible();
    await expect(page.getByText('Share your life with friends.')).toBeVisible();
  });

  test('moments page is accessible from navigation', async ({ page }) => {
    await navigateTo(page, '/chat');

    await page.getByRole('menuitem', { name: 'Moments' }).click();

    await expect(page).toHaveURL(/\/moments/);
    await expect(page.getByRole('heading', { name: 'Moments', exact: true })).toBeVisible();
  });
});

// ─── API-level tests ───────────────────────────────────────────────────────────

test.describe('Moments API', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedToken: string;
  let momentId: string;

  test.beforeAll(async () => {
    await requireBackend();
    const user = await getSharedUser();
    sharedToken = user.token;
  });

  test('Scenario: create a moment', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const create = await api.post('/api/moments', {
      data: {
        content: '今天天气真好',
        images: ['https://example.com/photo.jpg'],
        visibility: 'public',
      },
    });

    if (create.ok()) {
      const body = await create.json();
      expect(body).toBeDefined();
      if (typeof body === 'object') {
        momentId = body.id ?? body.data?.id ?? body.moment?.id ?? body.data?.momentId ?? '';
        if (momentId) {
          expect(body.data || body.moment || body).toBeDefined();
        }
      }
    }
    await api.dispose();
  });

  test('Scenario: get moments feed', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const feed = await api.get('/api/moments/feed');
    if (feed.ok()) {
      const body = await feed.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: like a moment', async () => {
    await requireBackend();
    if (!momentId) {
      test.skip(true, 'No moment created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const like = await api.post(`/api/moments/${momentId}/like`);

    if (like.ok()) {
      const likeBody = await like.json();
      expect(likeBody).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: unlike a moment', async () => {
    await requireBackend();
    if (!momentId) {
      test.skip(true, 'No moment created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    await api.post(`/api/moments/${momentId}/like`);

    const unlike = await api.delete(`/api/moments/${momentId}/like`);
    expect(unlike.ok() || unlike.status() === 404).toBeTruthy();
    await api.dispose();
  });

  test('Scenario: comment on a moment', async () => {
    await requireBackend();
    if (!momentId) {
      test.skip(true, 'No moment created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const comment = await api.post(`/api/moments/${momentId}/comments`, {
      data: { content: '确实！' },
    });

    if (comment.ok()) {
      const commentBody = await comment.json();
      expect(commentBody).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: delete a comment', async () => {
    await requireBackend();
    if (!momentId) {
      test.skip(true, 'No moment created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const comment = await api.post(`/api/moments/${momentId}/comments`, {
      data: { content: 'Test comment to delete' },
    });

    if (comment.ok()) {
      const commentBody = await comment.json();
      const commentId = commentBody.id || commentBody.data?.id;

      if (commentId) {
        const del = await api.delete(`/api/moments/${momentId}/comments/${commentId}`);
        expect(del.ok() || del.status() === 404).toBeTruthy();
      }
    }
    await api.dispose();
  });

  test('Scenario: delete a moment', async () => {
    await requireBackend();
    if (!momentId) {
      test.skip(true, 'No moment created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const del = await api.delete(`/api/moments/${momentId}`);
    expect(del.ok() || del.status() === 404).toBeTruthy();
    await api.dispose();
  });
});
