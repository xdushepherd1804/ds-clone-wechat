import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAuthService, AuthError } from './auth.service';
import { createAuthMiddleware } from './middleware';
import { InMemorySessionStore } from './session';
import { signJwt } from './jwt';
import type { AuthConfig, AuthDeps } from './auth.service';
import { ErrorCode } from '@wechat-clone/shared';

const SECRET = 'test-service-secret-key';
const CONFIG: AuthConfig = {
  jwtSecret: SECRET,
  accessExpire: '15m',
  refreshExpire: '7d',
};

function makePrismaMock() {
  const users = new Map<string, Record<string, unknown>>();

  return {
    user: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const key = where.id ?? where.username ?? where.phone;
        if (!key) return null;
        return users.get(String(key)) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const record = {
          id: `user_${users.size + 1}`,
          username: data.username,
          passwordHash: data.passwordHash,
          nickname: data.nickname,
          avatar: data.avatar ?? null,
          phone: data.phone ?? null,
          status: 'offline',
          lastSeenAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.set(record.id, record);
        users.set(record.username, record);
        if (record.phone) users.set(record.phone, record);
        return record;
      }),
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const seen = new Set<string>();
        const unique: Record<string, unknown>[] = [];
        for (const record of users.values()) {
          if (!record.id || seen.has(String(record.id))) continue;
          seen.add(String(record.id));
          if (args?.where) {
            const orConditions = args.where.OR as Array<Record<string, unknown>> | undefined;
            if (orConditions) {
              const matches = orConditions.some((cond) => {
                for (const [field, condition] of Object.entries(cond)) {
                  const { contains } = condition as { contains: string };
                  if (contains && typeof record[field] === 'string') {
                    return (record[field] as string).toLowerCase().includes(contains.toLowerCase());
                  }
                }
                return false;
              });
              if (!matches) continue;
            }
          }
          unique.push(record);
        }
        return unique;
      }),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const key = where.id ?? where.username;
        const record = users.get(String(key));
        if (!record) throw new Error('Not found');
        Object.assign(record, data, { updatedAt: new Date() });
        return record;
      }),
    },
  };
}

function createService(overrides: Partial<AuthDeps> = {}) {
  const prisma = makePrismaMock();
  const store = new InMemorySessionStore();
  return {
    service: createAuthService({
      prisma: prisma as unknown as AuthDeps['prisma'],
      redis: null,
      config: CONFIG,
      sessionStore: store,
      ...overrides,
    }),
    prisma,
    store,
  };
}

describe('AuthService', () => {
  describe('register', () => {
    it('registers a new user successfully', async () => {
      const { service } = createService();
      const result = await service.register({
        username: 'testuser',
        password: 'password123',
        nickname: 'Test User',
      });
      expect(result.user.username).toBe('testuser');
      expect(result.user.nickname).toBe('Test User');
      expect(result.user.id).toBeDefined();
    });

    it('rejects invalid username', async () => {
      const { service } = createService();
      await expect(
        service.register({ username: 'ab', password: 'password123', nickname: 'Test' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects too-short password', async () => {
      const { service } = createService();
      await expect(
        service.register({ username: 'testuser', password: 'short', nickname: 'Test' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects empty nickname', async () => {
      const { service } = createService();
      await expect(
        service.register({ username: 'testuser', password: 'password123', nickname: '' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects duplicate username', async () => {
      const { service } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'User 1' });
      await expect(
        service.register({ username: 'testuser', password: 'password456', nickname: 'User 2' }),
      ).rejects.toThrow(AuthError);
    });
  });

  describe('login', () => {
    it('logs in with valid credentials', async () => {
      const { service } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const result = await service.login({ username: 'testuser', password: 'password123' });
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.username).toBe('testuser');
      expect(result.expiresIn).toBe(900); // 15m
    });

    it('rejects wrong password', async () => {
      const { service } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      await expect(
        service.login({ username: 'testuser', password: 'wrongpassword' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects non-existent user', async () => {
      const { service } = createService();
      await expect(
        service.login({ username: 'nobody', password: 'password123' }),
      ).rejects.toThrow(AuthError);
    });

    it('rejects empty username', async () => {
      const { service } = createService();
      await expect(
        service.login({ username: '', password: 'password123' }),
      ).rejects.toThrow(AuthError);
    });

    it('creates a session on login', async () => {
      const { service, store } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });
      const result = await service.login({ username: 'testuser', password: 'password123' });

      // Decode the access token to get jti
      const parts = result.token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const session = await store.getByJti(payload.jti);
      expect(session).not.toBeNull();
      expect(session!.userId).toBe(result.user.id);
    });
  });

  describe('logout', () => {
    it('clears session on logout', async () => {
      const { service, store } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });
      const loginResult = await service.login({ username: 'testuser', password: 'password123' });

      const parts = loginResult.token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      await service.logout(loginResult.token);
      const session = await store.getByJti(payload.jti);
      expect(session).toBeNull();
    });

    it('does not throw on invalid token', async () => {
      const { service } = createService();
      await expect(service.logout('invalid-token')).resolves.toBeUndefined();
    });
  });

  describe('refreshTokens', () => {
    it('refreshes tokens successfully', async () => {
      const { service, store } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });
      const loginResult = await service.login({ username: 'testuser', password: 'password123' });

      const result = await service.refreshTokens(loginResult.refreshToken);
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.token).not.toBe(loginResult.token);
      expect(result.user.username).toBe('testuser');
    });

    it('revokes old session after refresh', async () => {
      const { service, store } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });
      const loginResult = await service.login({ username: 'testuser', password: 'password123' });

      const oldParts = loginResult.token.split('.');
      const oldPayload = JSON.parse(Buffer.from(oldParts[1], 'base64url').toString());

      await service.refreshTokens(loginResult.refreshToken);

      const oldSession = await store.getByJti(oldPayload.jti);
      expect(oldSession).toBeNull();
    });

    it('rejects access token for refresh', async () => {
      const { service } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });
      const loginResult = await service.login({ username: 'testuser', password: 'password123' });

      await expect(
        service.refreshTokens(loginResult.token),
      ).rejects.toThrow(AuthError);
    });

    it('rejects expired refresh token', async () => {
      const { service } = createService();
      await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const expiredRefreshToken = signJwt(
        {
          sub: 'nonexistent',
          username: 'testuser',
          type: 'refresh',
          jti: 'expired-jti',
          exp: Math.floor(Date.now() / 1000) - 1,
        },
        SECRET,
      );

      await expect(
        service.refreshTokens(expiredRefreshToken),
      ).rejects.toThrow(AuthError);
    });
  });

  describe('getCurrentUser', () => {
    it('returns the user profile', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const user = await service.getCurrentUser(reg.user.id);
      expect(user.id).toBe(reg.user.id);
      expect(user.username).toBe('testuser');
    });

    it('throws for unknown user', async () => {
      const { service } = createService();
      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(AuthError);
    });
  });

  describe('updateProfile', () => {
    it('updates nickname', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Old' });

      const updated = await service.updateProfile(reg.user.id, { nickname: 'New Nick' });
      expect(updated.nickname).toBe('New Nick');
    });

    it('rejects empty nickname', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Old' });

      await expect(
        service.updateProfile(reg.user.id, { nickname: '' }),
      ).rejects.toThrow(AuthError);
    });
  });

  describe('getUserById', () => {
    it('returns public profile', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const profile = await service.getUserById(reg.user.id);
      expect(profile.id).toBe(reg.user.id);
      expect(profile.username).toBe('testuser');
      // Public profile should not have private fields
      expect((profile as Record<string, unknown>).phone).toBeUndefined();
    });
  });

  describe('searchUsers', () => {
    it('rejects empty query', async () => {
      const { service } = createService();
      await expect(service.searchUsers('')).rejects.toThrow(AuthError);
      await expect(service.searchUsers('   ')).rejects.toThrow(AuthError);
    });

    it('returns matching users', async () => {
      const { service } = createService();
      await service.register({ username: 'alice', password: 'password123', nickname: 'Alice' });
      await service.register({ username: 'bob', password: 'password123', nickname: 'Bob' });

      const result = await service.searchUsers('ali');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].username).toBe('alice');
    });
  });

  describe('changePassword', () => {
    it('changes password successfully', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'oldpass123', nickname: 'Test' });

      await service.changePassword(reg.user.id, { oldPassword: 'oldpass123', newPassword: 'newpass456' });

      // Should be able to login with new password
      const result = await service.login({ username: 'testuser', password: 'newpass456' });
      expect(result.user.username).toBe('testuser');
    });

    it('rejects wrong old password', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'oldpass123', nickname: 'Test' });

      await expect(
        service.changePassword(reg.user.id, { oldPassword: 'wrongold', newPassword: 'newpass456' }),
      ).rejects.toThrow(AuthError);
    });

    it('invalidates all sessions after password change', async () => {
      const { service, store } = createService();
      const reg = await service.register({ username: 'testuser', password: 'oldpass123', nickname: 'Test' });
      const loginResult = await service.login({ username: 'testuser', password: 'oldpass123' });

      const parts = loginResult.token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

      await service.changePassword(reg.user.id, { oldPassword: 'oldpass123', newPassword: 'newpass456' });

      const session = await store.getByJti(payload.jti);
      expect(session).toBeNull();
    });

    it('rejects too-weak new password', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'oldpass123', nickname: 'Test' });

      await expect(
        service.changePassword(reg.user.id, { oldPassword: 'oldpass123', newPassword: 'short' }),
      ).rejects.toThrow(AuthError);
    });
  });

  describe('updateAvatar', () => {
    it('updates user avatar', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const updated = await service.updateAvatar(reg.user.id, 'https://example.com/avatar.png');
      expect(updated.avatar).toBe('https://example.com/avatar.png');
    });

    it('sets avatar to null', async () => {
      const { service } = createService();
      const reg = await service.register({ username: 'testuser', password: 'password123', nickname: 'Test' });

      const updated = await service.updateAvatar(reg.user.id, null);
      expect(updated.avatar).toBeNull();
    });
  });

  describe('checkRateLimit', () => {
    it('skips when redis is not configured', async () => {
      const { service } = createService();
      await expect(
        service.checkRateLimit('login', 'testuser', 60, 5),
      ).resolves.toBeUndefined();
    });
  });

  describe('concurrent login', () => {
    it('allows multiple simultaneous logins from same user', async () => {
      const { service } = createService();
      await service.register({ username: 'concurrent', password: 'password123', nickname: 'Test' });

      const [r1, r2] = await Promise.all([
        service.login({ username: 'concurrent', password: 'password123' }),
        service.login({ username: 'concurrent', password: 'password123' }),
      ]);

      // Both should succeed
      expect(r1.token).toBeTruthy();
      expect(r2.token).toBeTruthy();

      // Each login should produce unique tokens
      expect(r1.token).not.toBe(r2.token);
      expect(r1.refreshToken).not.toBe(r2.refreshToken);

      // Both resolve to the correct user
      expect(r1.user.username).toBe('concurrent');
      expect(r2.user.username).toBe('concurrent');
      expect(r1.user.id).toBe(r2.user.id);

      // Each token has a different JTI
      const p1 = JSON.parse(Buffer.from(r1.token.split('.')[1], 'base64url').toString());
      const p2 = JSON.parse(Buffer.from(r2.token.split('.')[1], 'base64url').toString());
      expect(p1.jti).not.toBe(p2.jti);
    });
  });

  describe('logout invalidates correct session only', () => {
    it('logging out one session does not affect other sessions', async () => {
      const { service, store } = createService();
      await service.register({ username: 'multi', password: 'password123', nickname: 'Test' });

      const r1 = await service.login({ username: 'multi', password: 'password123' });
      const r2 = await service.login({ username: 'multi', password: 'password123' });

      const p1 = JSON.parse(Buffer.from(r1.token.split('.')[1], 'base64url').toString());
      const p2 = JSON.parse(Buffer.from(r2.token.split('.')[1], 'base64url').toString());

      // Logout session 1
      await service.logout(r1.token);

      // Session 1 should be gone
      expect(await store.getByJti(p1.jti)).toBeNull();
      // Session 2 should still exist
      expect(await store.getByJti(p2.jti)).not.toBeNull();
    });
  });
});

describe('Auth Middleware / 401', () => {
  const authenticate = createAuthMiddleware(SECRET);

  it('returns 401 equivalent when no token provided', () => {
    try {
      authenticate('');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('returns 401 equivalent when token is missing even with Bearer prefix', () => {
    try {
      authenticate('Bearer ');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
    }
  });

  it('returns 401 equivalent when token is malformed', () => {
    try {
      authenticate('Bearer not.a.valid.jwt.token');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect([ErrorCode.TOKEN_INVALID, ErrorCode.UNAUTHORIZED]).toContain((err as AuthError).code);
    }
  });

  it('rejects expired token', () => {
    const expired = signJwt(
      { sub: 'u1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) - 60 },
      SECRET,
    );
    try {
      authenticate(expired);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError);
      expect((err as AuthError).code).toBe(ErrorCode.TOKEN_EXPIRED);
    }
  });
});
