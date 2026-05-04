import { describe, it, expect } from 'vitest';
import {
  isValidUsername,
  isValidPassword,
  isValidNickname,
  isValidPhone,
  isValidEmail,
  isValidUrl,
  isValidId,
  isValidMsgContent,
  sanitizeText,
} from './validator';

describe('isValidUsername', () => {
  it('accepts valid usernames', () => {
    expect(isValidUsername('john_doe')).toBe(true);
    expect(isValidUsername('Alice123')).toBe(true);
    expect(isValidUsername('user')).toBe(true);
    expect(isValidUsername('a_1')).toBe(true);
  });

  it('rejects usernames that start with a digit', () => {
    expect(isValidUsername('1user')).toBe(false);
    expect(isValidUsername('123abc')).toBe(false);
  });

  it('rejects usernames that start with underscore', () => {
    expect(isValidUsername('_user')).toBe(false);
  });

  it('rejects usernames that are too short (< 3 chars)', () => {
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a')).toBe(false);
  });

  it('rejects usernames that are too long (> 20 chars)', () => {
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('rejects usernames with special characters', () => {
    expect(isValidUsername('user-name')).toBe(false);
    expect(isValidUsername('user.name')).toBe(false);
    expect(isValidUsername('user name')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidUsername('')).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('accepts passwords >= 6 characters', () => {
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('a-longer-password-123')).toBe(true);
  });

  it('rejects passwords < 6 characters', () => {
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword('ab')).toBe(false);
  });

  it('rejects passwords > 128 characters', () => {
    expect(isValidPassword('a'.repeat(129))).toBe(false);
  });

  it('rejects whitespace-only passwords', () => {
    expect(isValidPassword('      ')).toBe(false);
  });
});

describe('isValidNickname', () => {
  it('accepts valid nicknames', () => {
    expect(isValidNickname('John')).toBe(true);
    expect(isValidNickname('a')).toBe(true);
    expect(isValidNickname('A very long nickname with spaces and emoji')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidNickname('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidNickname('   ')).toBe(false);
  });

  it('rejects nicknames > 50 characters', () => {
    expect(isValidNickname('a'.repeat(51))).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts valid Chinese mobile numbers', () => {
    expect(isValidPhone('13800138000')).toBe(true);
    expect(isValidPhone('15912345678')).toBe(true);
    expect(isValidPhone('18800001111')).toBe(true);
  });

  it('rejects numbers starting with invalid prefix', () => {
    expect(isValidPhone('12000138000')).toBe(false);
    expect(isValidPhone('10012345678')).toBe(false);
  });

  it('rejects too short or too long numbers', () => {
    expect(isValidPhone('1380013800')).toBe(false);
    expect(isValidPhone('138001380000')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(isValidPhone('1380013800a')).toBe(false);
  });
});

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a@b.c')).toBe(true);
    expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('notanemail')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user @domain.com')).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('rejects non-http URLs', () => {
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('ws://example.com')).toBe(false);
  });

  it('rejects non-URL strings', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not a url')).toBe(false);
  });
});

describe('isValidId', () => {
  it('accepts alphanumeric, hyphen, and underscore IDs', () => {
    expect(isValidId('abc123')).toBe(true);
    expect(isValidId('user-id_001')).toBe(true);
    expect(isValidId('a')).toBe(true);
    expect(isValidId('a'.repeat(64))).toBe(true);
  });

  it('rejects IDs with special characters', () => {
    expect(isValidId('user@id')).toBe(false);
    expect(isValidId('user.id')).toBe(false);
    expect(isValidId('user id')).toBe(false);
  });

  it('rejects IDs > 64 characters', () => {
    expect(isValidId('a'.repeat(65))).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidId('')).toBe(false);
  });
});

describe('isValidMsgContent', () => {
  it('accepts non-empty text within max length', () => {
    expect(isValidMsgContent('Hello')).toBe(true);
    expect(isValidMsgContent('Hi')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidMsgContent('')).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(isValidMsgContent('   ')).toBe(false);
  });

  it('rejects text exceeding max length', () => {
    expect(isValidMsgContent('a'.repeat(5001))).toBe(false);
  });

  it('accepts text exactly at max length', () => {
    expect(isValidMsgContent('a'.repeat(5000))).toBe(true);
  });

  it('accepts custom max length', () => {
    expect(isValidMsgContent('abc', 10)).toBe(true);
    expect(isValidMsgContent('abc', 2)).toBe(false);
  });
});

describe('sanitizeText', () => {
  it('escapes HTML special characters', () => {
    expect(sanitizeText('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands', () => {
    expect(sanitizeText('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(sanitizeText("it's")).toBe('it&#x27;s');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizeText('Hello, World!')).toBe('Hello, World!');
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeText('')).toBe('');
  });
});
