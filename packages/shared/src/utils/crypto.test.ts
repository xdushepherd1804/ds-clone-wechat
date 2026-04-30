import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  md5,
  sha256,
  randomToken,
  hashPassword,
  verifyPassword,
} from './crypto';

describe('encrypt / decrypt', () => {
  const secret = 'test-secret-key-32chars!!!';

  it('round-trips a plaintext correctly', () => {
    const plain = 'Hello, WeChat Clone!';
    const encrypted = encrypt(plain, secret);
    expect(encrypted).not.toBe(plain);
    expect(decrypt(encrypted, secret)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const plain = 'same message';
    const c1 = encrypt(plain, secret);
    const c2 = encrypt(plain, secret);
    expect(c1).not.toBe(c2);
  });

  it('handles empty strings', () => {
    const encrypted = encrypt('', secret);
    expect(decrypt(encrypted, secret)).toBe('');
  });

  it('handles Unicode characters', () => {
    const plain = '你好，世界！🌍';
    const encrypted = encrypt(plain, secret);
    expect(decrypt(encrypted, secret)).toBe(plain);
  });

  it('handles long messages', () => {
    const plain = 'a'.repeat(10000);
    const encrypted = encrypt(plain, secret);
    expect(decrypt(encrypted, secret)).toBe(plain);
  });

  it('decrypt with wrong secret throws', () => {
    const encrypted = encrypt('secret message', secret);
    expect(() => decrypt(encrypted, 'wrong-secret-key-32chars!!')).toThrow();
  });

  it('tampered ciphertext throws', () => {
    const encrypted = encrypt('secret message', secret);
    const tampered = 'X' + encrypted.slice(1);
    expect(() => decrypt(tampered, secret)).toThrow();
  });
});

describe('md5', () => {
  it('returns a 32-character hex string', () => {
    const hash = md5('hello');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces deterministic output', () => {
    expect(md5('hello')).toBe(md5('hello'));
  });

  it('different inputs produce different hashes', () => {
    expect(md5('hello')).not.toBe(md5('world'));
  });
});

describe('sha256', () => {
  it('returns a 64-character hex string', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic output', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });
});

describe('randomToken', () => {
  it('returns 64 hex chars by default (32 bytes)', () => {
    const token = randomToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts custom byte length', () => {
    expect(randomToken(16)).toHaveLength(32);
    expect(randomToken(8)).toHaveLength(16);
    expect(randomToken(2)).toHaveLength(4);
  });

  it('produces different tokens each call', () => {
    expect(randomToken()).not.toBe(randomToken());
  });
});

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a password correctly', () => {
    const { hash, salt } = hashPassword('my-secret-password');
    expect(hash).toBeTruthy();
    expect(salt).toBeTruthy();
    expect(verifyPassword('my-secret-password', hash, salt)).toBe(true);
  });

  it('rejects wrong password', () => {
    const { hash, salt } = hashPassword('correct-password');
    expect(verifyPassword('wrong-password', hash, salt)).toBe(false);
  });

  it('produces different hashes for same password (random salt)', () => {
    const r1 = hashPassword('same-password');
    const r2 = hashPassword('same-password');
    expect(r1.hash).not.toBe(r2.hash);
    expect(r1.salt).not.toBe(r2.salt);
  });

  it('produces hex salt (32 chars = 16 bytes)', () => {
    const { salt } = hashPassword('test');
    expect(salt).toHaveLength(32);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('produces hex hash (128 chars = 64 bytes)', () => {
    const { hash } = hashPassword('test');
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });
});
