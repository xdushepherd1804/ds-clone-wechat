import { describe, it, expect } from 'vitest';
import { API_PREFIX } from './api';

describe('API types', () => {
  describe('API_PREFIX', () => {
    it('equals /api/v1', () => {
      expect(API_PREFIX).toBe('/api/v1');
    });

    it('starts with /', () => {
      expect(API_PREFIX.startsWith('/')).toBe(true);
    });
  });
});
