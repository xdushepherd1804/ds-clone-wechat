import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken, removeToken } from './token';

describe('token utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getToken', () => {
    it('returns null when no token is set', () => {
      expect(getToken()).toBeNull();
    });

    it('returns the stored token', () => {
      localStorage.setItem('wechat_clone_token', 'test-token-123');
      expect(getToken()).toBe('test-token-123');
    });
  });

  describe('setToken', () => {
    it('stores a token in localStorage', () => {
      setToken('my-token');
      expect(localStorage.getItem('wechat_clone_token')).toBe('my-token');
    });

    it('overwrites an existing token', () => {
      setToken('old-token');
      setToken('new-token');
      expect(localStorage.getItem('wechat_clone_token')).toBe('new-token');
    });
  });

  describe('removeToken', () => {
    it('removes the token from localStorage', () => {
      setToken('my-token');
      removeToken();
      expect(localStorage.getItem('wechat_clone_token')).toBeNull();
    });

    it('is a no-op when no token exists', () => {
      expect(() => removeToken()).not.toThrow();
    });
  });
});
