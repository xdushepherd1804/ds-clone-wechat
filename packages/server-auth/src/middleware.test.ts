import { describe, it, expect } from 'vitest';
import { createAuthMiddleware, extractTokenFromHeader } from './middleware';
import { signJwt } from './jwt';
import { ErrorCode } from '@wechat-clone/shared';

const SECRET = 'test-middleware-secret';

function createAccessToken(overrides: Record<string, unknown> = {}) {
  return signJwt(
    {
      sub: 'user-1',
      username: 'alice',
      type: 'access' as const,
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 900,
      ...overrides,
    },
    SECRET,
  );
}

function createRefreshToken() {
  return signJwt(
    {
      sub: 'user-1',
      username: 'alice',
      type: 'refresh' as const,
      jti: 'jti-1',
      exp: Math.floor(Date.now() / 1000) + 604800,
    },
    SECRET,
  );
}

describe('createAuthMiddleware', () => {
  const authenticate = createAuthMiddleware(SECRET);

  it('authenticates a valid access token', () => {
    const token = createAccessToken();
    const ctx = authenticate(token);
    expect(ctx.userId).toBe('user-1');
    expect(ctx.username).toBe('alice');
    expect(ctx.tokenType).toBe('access');
    expect(ctx.jti).toBe('jti-1');
  });

  it('authenticates a token with Bearer prefix', () => {
    const token = createAccessToken();
    const ctx = authenticate(`Bearer ${token}`);
    expect(ctx.userId).toBe('user-1');
  });

  it('rejects empty token', () => {
    expect(() => authenticate('')).toThrow();
  });

  it('rejects expired token', () => {
    const token = createAccessToken({ exp: Math.floor(Date.now() / 1000) - 1 });
    expect(() => authenticate(token)).toThrow();
  });

  it('rejects token signed with different secret', () => {
    const token = signJwt(
      {
        sub: 'user-1',
        username: 'alice',
        type: 'access' as const,
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      'different-secret',
    );
    expect(() => authenticate(token)).toThrow();
  });

  it('rejects refresh token (type not access)', () => {
    const token = createRefreshToken();
    expect(() => authenticate(token)).toThrow();
  });

  it('rejects malformed token', () => {
    expect(() => authenticate('not.a.valid.jwt.token')).toThrow();
  });
});

describe('extractTokenFromHeader', () => {
  it('extracts Bearer token', () => {
    expect(extractTokenFromHeader('Bearer abc123')).toBe('abc123');
  });

  it('returns undefined header as null', () => {
    expect(extractTokenFromHeader(undefined)).toBeNull();
  });

  it('returns bare token without Bearer prefix', () => {
    expect(extractTokenFromHeader('abc123')).toBe('abc123');
  });

  it('returns null for multi-word non-Bearer header', () => {
    expect(extractTokenFromHeader('Basic abc123 def456')).toBeNull();
  });

  it('handles empty string', () => {
    expect(extractTokenFromHeader('')).toBeNull();
  });
});
