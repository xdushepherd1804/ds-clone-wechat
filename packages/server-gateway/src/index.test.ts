import { describe, it, expect } from 'vitest';
import { bootstrap } from './index';

describe('server-gateway', () => {
  describe('bootstrap', () => {
    it('is a function', () => {
      expect(typeof bootstrap).toBe('function');
    });

    it('can be called without throwing', () => {
      expect(() => bootstrap()).not.toThrow();
    });

    it('returns undefined (no return value)', () => {
      expect(bootstrap()).toBeUndefined();
    });
  });
});
