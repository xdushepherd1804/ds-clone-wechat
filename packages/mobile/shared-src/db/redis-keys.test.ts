import { describe, it, expect } from 'vitest';
import { RedisKeys, RedisKeyPatterns } from './redis-keys';

const PREFIX = 'wc';

// ─── Key Generators ───────────────────────────────────────────────────────────

describe('RedisKeys', () => {
  describe('session', () => {
    it('generates correct session token key', () => {
      expect(RedisKeys.session('abc123')).toBe(`${PREFIX}:session:abc123`);
    });

    it('handles tokens with special characters', () => {
      expect(RedisKeys.session('token/with.dots_and-dashes')).toBe(
        `${PREFIX}:session:token/with.dots_and-dashes`,
      );
    });

    it('handles empty token', () => {
      expect(RedisKeys.session('')).toBe(`${PREFIX}:session:`);
    });
  });

  describe('userOnline', () => {
    it('generates correct online status key', () => {
      expect(RedisKeys.userOnline('uid_001')).toBe(`${PREFIX}:user:online:uid_001`);
    });

    it('handles numeric user IDs', () => {
      expect(RedisKeys.userOnline('12345')).toBe(`${PREFIX}:user:online:12345`);
    });
  });

  describe('wsConn', () => {
    it('generates correct WebSocket connection key', () => {
      expect(RedisKeys.wsConn('uid_001')).toBe(`${PREFIX}:ws:conn:uid_001`);
    });
  });

  describe('groupMembers', () => {
    it('generates correct group members key', () => {
      expect(RedisKeys.groupMembers('gid_001')).toBe(`${PREFIX}:group:members:gid_001`);
    });
  });

  describe('userProfile', () => {
    it('generates correct user profile key', () => {
      expect(RedisKeys.userProfile('uid_001')).toBe(`${PREFIX}:user:profile:uid_001`);
    });
  });

  describe('recentContacts', () => {
    it('generates correct recent contacts key', () => {
      expect(RedisKeys.recentContacts('uid_001')).toBe(`${PREFIX}:user:recent:uid_001`);
    });
  });

  describe('offlineMessages', () => {
    it('generates correct offline messages key', () => {
      expect(RedisKeys.offlineMessages('uid_001')).toBe(`${PREFIX}:user:offline:uid_001`);
    });
  });

  describe('rateLimit', () => {
    it('generates rate limit key with action, identifier, and window', () => {
      expect(RedisKeys.rateLimit('login', '127.0.0.1', '1m')).toBe(
        `${PREFIX}:rate:login:127.0.0.1:1m`,
      );
    });

    it('generates rate limit key with UID identifier', () => {
      expect(RedisKeys.rateLimit('send_message', 'uid_001', '1h')).toBe(
        `${PREFIX}:rate:send_message:uid_001:1h`,
      );
    });
  });

  describe('lock', () => {
    it('generates distributed lock key', () => {
      expect(RedisKeys.lock('create_group')).toBe(`${PREFIX}:lock:create_group`);
    });

    it('generates resource-specific lock keys', () => {
      expect(RedisKeys.lock('group:gid_001:update')).toBe(
        `${PREFIX}:lock:group:gid_001:update`,
      );
    });
  });

  // ─── TTL Constants ─────────────────────────────────────────────────────────

  describe('SESSION_TTL', () => {
    it('equals 7 days in seconds', () => {
      expect(RedisKeys.SESSION_TTL).toBe(604800);
    });

    it('is a positive number', () => {
      expect(RedisKeys.SESSION_TTL).toBeGreaterThan(0);
    });
  });

  describe('ONLINE_TTL', () => {
    it('equals 30 seconds (heartbeat interval)', () => {
      expect(RedisKeys.ONLINE_TTL).toBe(30);
    });
  });

  describe('USER_PROFILE_TTL', () => {
    it('equals 1 hour in seconds', () => {
      expect(RedisKeys.USER_PROFILE_TTL).toBe(3600);
    });
  });
});

// ─── Key Patterns ─────────────────────────────────────────────────────────────

describe('RedisKeyPatterns', () => {
  const patterns = Object.entries(RedisKeyPatterns);

  it('has all 10 key pattern categories', () => {
    expect(Object.keys(RedisKeyPatterns)).toHaveLength(10);
  });

  it.each([
    ['session', `${PREFIX}:session:*`],
    ['userOnline', `${PREFIX}:user:online:*`],
    ['wsConn', `${PREFIX}:ws:conn:*`],
    ['groupMembers', `${PREFIX}:group:members:*`],
    ['userProfile', `${PREFIX}:user:profile:*`],
    ['recentContacts', `${PREFIX}:user:recent:*`],
    ['offlineMessages', `${PREFIX}:user:offline:*`],
    ['redPacket', `${PREFIX}:rp:*`],
    ['rateLimit', `${PREFIX}:rate:*`],
    ['lock', `${PREFIX}:lock:*`],
  ])('%s pattern is correct', (name, expected) => {
    expect(RedisKeyPatterns[name as keyof typeof RedisKeyPatterns]).toBe(expected);
  });

  it('every pattern uses the wc: prefix', () => {
    for (const [, pattern] of patterns) {
      expect(pattern).toMatch(/^wc:/);
    }
  });

  it('every pattern ends with * (wildcard for SCAN)', () => {
    for (const [, pattern] of patterns) {
      expect(pattern).toMatch(/\*$/);
    }
  });

  it('patterns cover all key-generating functions in RedisKeys', () => {
    const keyGenerators = [
      'session',
      'userOnline',
      'wsConn',
      'groupMembers',
      'userProfile',
      'recentContacts',
      'offlineMessages',
      'rateLimit',
      'lock',
    ];
    const patternNames = Object.keys(RedisKeyPatterns);
    for (const gen of keyGenerators) {
      expect(patternNames).toContain(gen);
    }
  });
});
