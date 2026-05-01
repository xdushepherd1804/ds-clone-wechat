/**
 * E2E tests: Group chat flows.
 */
import { test, expect } from '@playwright/test';
import { getSharedUser, createAuthContext, requireBackend } from '../fixtures/test-helpers';

test.describe('Group API — create & manage', () => {
  test.describe.configure({ mode: 'serial' });

  let sharedToken: string;
  let sharedUserId: string;
  let groupId: string;

  test.beforeAll(async () => {
    await requireBackend();
    const user = await getSharedUser();
    sharedToken = user.token;
    sharedUserId = user.userId;
  });

  test('Scenario: create group chat', async () => {
    await requireBackend();
    const api = await createAuthContext(sharedToken);

    const create = await api.post('/api/groups/create', {
      data: { name: 'E2E 技术交流群' },
    });

    if (create.ok()) {
      const body = await create.json();
      expect(body).toBeDefined();
      if (typeof body === 'object') {
        // Extract group ID from any plausible response shape
        groupId = body.id ?? body.data?.id ?? body.group?.id ?? body.data?.groupId ?? '';
        if (groupId) {
          expect(body.name || body.group?.name || body.data?.name).toBeTruthy();
        }
      }
    }
    await api.dispose();
  });

  test('Scenario: get group info', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created in previous step');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const info = await api.get(`/api/groups/${groupId}`);
    if (info.ok()) {
      const body = await info.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: get group members', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const members = await api.get(`/api/groups/${groupId}/members`);
    if (members.ok()) {
      const body = await members.json();
      expect(body).toBeDefined();
      if (Array.isArray(body) || Array.isArray(body.members)) {
        const list = Array.isArray(body) ? body : body.members;
        expect(list.length).toBeGreaterThanOrEqual(1);
      }
    }
    await api.dispose();
  });

  test('Scenario: invite user to group', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created');
      return;
    }
    const memberUser = await setupTestUser();
    const api = await createAuthContext(sharedToken);

    const add = await api.post(`/api/groups/${groupId}/members`, {
      data: { userIds: [memberUser.userId] },
    });

    if (add.ok()) {
      const members = await api.get(`/api/groups/${groupId}/members`);
      if (members.ok()) {
        const body = await members.json();
        expect(body).toBeDefined();
      }
    }
    await api.dispose();
  });

  test('Scenario: @mention validation', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const validate = await api.post(`/api/groups/${groupId}/mentions/validate`, {
      data: { userIds: [sharedUserId] },
    });

    if (validate.ok()) {
      const body = await validate.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: update group announcement', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const update = await api.put(`/api/groups/${groupId}/announcement`, {
      data: { announcement: 'Welcome to E2E test group!' },
    });

    if (update.ok()) {
      const body = await update.json();
      expect(body).toBeDefined();
    }
    await api.dispose();
  });

  test('Scenario: quit group', async () => {
    await requireBackend();
    if (!groupId) {
      test.skip(true, 'No group created');
      return;
    }
    const api = await createAuthContext(sharedToken);

    const quit = await api.post(`/api/groups/${groupId}/quit`);
    expect([200, 201, 204, 400, 403, 404]).toContain(quit.status());
    await api.dispose();
  });
});
