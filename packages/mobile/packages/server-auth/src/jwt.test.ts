import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt, decodeJwt, parseExpireString, JwtError } from './jwt';

const SECRET = 'test-jwt-secret-key';

describe('jwt', () => {
  describe('signJwt', () => {
    it('produces a three-part token', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 },
        SECRET,
      );
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('sets iat automatically', () => {
      const before = Math.floor(Date.now() / 1000);
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 3600 },
        SECRET,
      );
      const payload = decodeJwt(token);
      expect(payload.iat).toBeGreaterThanOrEqual(before);
    });
  });

  describe('verifyJwt', () => {
    it('verifies a valid token', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
        SECRET,
      );
      const payload = verifyJwt(token, SECRET);
      expect(payload.sub).toBe('user-1');
      expect(payload.username).toBe('alice');
      expect(payload.type).toBe('access');
    });

    it('rejects token signed with different secret', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
        SECRET,
      );
      expect(() => verifyJwt(token, 'different-secret')).toThrow(JwtError);
      expect(() => verifyJwt(token, 'different-secret')).toThrow('invalid signature');
    });

    it('rejects expired token', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) - 1 },
        SECRET,
      );
      expect(() => verifyJwt(token, SECRET)).toThrow('token expired');
    });

    it('rejects malformed token', () => {
      expect(() => verifyJwt('not-a-jwt', SECRET)).toThrow('malformed token');
      expect(() => verifyJwt('a.b', SECRET)).toThrow('malformed token');
    });

    it('rejects tampered token', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
        SECRET,
      );
      const parts = token.split('.');
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'hacker' })).toString('base64url')}.${parts[2]}`;
      expect(() => verifyJwt(tampered, SECRET)).toThrow('invalid signature');
    });
  });

  describe('decodeJwt', () => {
    it('decodes without verifying signature', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', exp: Math.floor(Date.now() / 1000) + 900 },
        SECRET,
      );
      const payload = decodeJwt(token);
      expect(payload.sub).toBe('user-1');
    });

    it('throws on malformed token', () => {
      expect(() => decodeJwt('bad')).toThrow('malformed token');
    });
  });

  describe('parseExpireString', () => {
    it('parses seconds', () => expect(parseExpireString('30s')).toBe(30));
    it('parses minutes', () => expect(parseExpireString('5m')).toBe(300));
    it('parses hours', () => expect(parseExpireString('2h')).toBe(7200));
    it('parses days', () => expect(parseExpireString('7d')).toBe(604800));
    it('throws on invalid format', () => {
      expect(() => parseExpireString('bad')).toThrow();
    });
  });

  describe('JWT roundtrip', () => {
    it('access token roundtrip', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'access', jti: 'abc123', exp: Math.floor(Date.now() / 1000) + 900 },
        SECRET,
      );
      const payload = verifyJwt(token, SECRET);
      expect(payload.sub).toBe('user-1');
      expect(payload.jti).toBe('abc123');
      expect(payload.type).toBe('access');
    });

    it('refresh token roundtrip', () => {
      const token = signJwt(
        { sub: 'user-1', username: 'alice', type: 'refresh', jti: 'def456', exp: Math.floor(Date.now() / 1000) + 604800 },
        SECRET,
      );
      const payload = verifyJwt(token, SECRET);
      expect(payload.type).toBe('refresh');
      expect(payload.jti).toBe('def456');
    });
  });
});
