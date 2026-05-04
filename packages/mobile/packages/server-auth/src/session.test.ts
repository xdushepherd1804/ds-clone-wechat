import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemorySessionStore } from './session';
import type { SessionData } from './session';

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    userId: 'user-1',
    username: 'alice',
    deviceId: 'dev-1',
    refreshTokenJti: 'jti-1',
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe('InMemorySessionStore', () => {
  let store: InMemorySessionStore;

  beforeEach(() => {
    store = new InMemorySessionStore();
  });

  describe('create', () => {
    it('stores a session and retrieves it by jti', async () => {
      const session = makeSession();
      await store.create(session, 3600);
      const found = await store.get('jti-1');
      expect(found).not.toBeNull();
      expect(found!.userId).toBe('user-1');
      expect(found!.username).toBe('alice');
      expect(found!.refreshTokenJti).toBe('jti-1');
    });

    it('stores multiple sessions for the same user', async () => {
      await store.create(makeSession({ refreshTokenJti: 'jti-1' }), 3600);
      await store.create(makeSession({ refreshTokenJti: 'jti-2' }), 3600);
      expect(await store.get('jti-1')).not.toBeNull();
      expect(await store.get('jti-2')).not.toBeNull();
    });

    it('stores sessions for different users', async () => {
      await store.create(makeSession({ userId: 'user-1', refreshTokenJti: 'jti-1' }), 3600);
      await store.create(makeSession({ userId: 'user-2', refreshTokenJti: 'jti-2' }), 3600);
      expect(await store.get('jti-1')).not.toBeNull();
      expect(await store.get('jti-2')).not.toBeNull();
    });
  });

  describe('get', () => {
    it('returns null for unknown token', async () => {
      const found = await store.get('nonexistent');
      expect(found).toBeNull();
    });

    it('returns null for expired session', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      const session = makeSession();
      await store.create(session, 1); // 1 second TTL

      vi.advanceTimersByTime(2000); // advance past expiry
      const found = await store.get('jti-1');
      expect(found).toBeNull();

      vi.useRealTimers();
    });

    it('returns session data when within TTL', async () => {
      const session = makeSession();
      await store.create(session, 3600);
      const found = await store.get('jti-1');
      expect(found).toEqual(session);
    });

    it('expired session is removed on get', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      await store.create(makeSession(), 1);
      vi.advanceTimersByTime(2000);

      await store.get('jti-1');
      // Second get should also return null
      const found = await store.get('jti-1');
      expect(found).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('getByJti', () => {
    it('delegates to get', async () => {
      const session = makeSession();
      await store.create(session, 3600);
      const found = await store.getByJti('jti-1');
      expect(found).toEqual(session);
    });

    it('returns null for unknown jti', async () => {
      const found = await store.getByJti('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes a session', async () => {
      await store.create(makeSession(), 3600);
      await store.delete('jti-1');
      expect(await store.get('jti-1')).toBeNull();
    });

    it('removes from userSessions tracking', async () => {
      await store.create(makeSession(), 3600);
      await store.delete('jti-1');
      // Should not throw when deleting all for user after session was individually deleted
      await store.deleteAllForUser('user-1');
    });

    it('is a no-op for unknown token', async () => {
      await expect(store.delete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('deleteByJti', () => {
    it('delegates to delete', async () => {
      await store.create(makeSession(), 3600);
      await store.deleteByJti('jti-1');
      expect(await store.get('jti-1')).toBeNull();
    });
  });

  describe('deleteAllForUser', () => {
    it('removes all sessions for a user', async () => {
      await store.create(makeSession({ refreshTokenJti: 'jti-1' }), 3600);
      await store.create(makeSession({ refreshTokenJti: 'jti-2' }), 3600);
      await store.create(makeSession({ userId: 'user-2', refreshTokenJti: 'jti-3' }), 3600);

      await store.deleteAllForUser('user-1');

      expect(await store.get('jti-1')).toBeNull();
      expect(await store.get('jti-2')).toBeNull();
      expect(await store.get('jti-3')).not.toBeNull();
    });

    it('is a no-op for user with no sessions', async () => {
      await expect(store.deleteAllForUser('unknown')).resolves.toBeUndefined();
    });
  });
});
