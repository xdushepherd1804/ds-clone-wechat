import { describe, it, expect } from 'vitest';
import { createSearchService, SearchError } from './index';

describe('server-search', () => {
  describe('module exports', () => {
    it('exports createSearchService as a function', () => {
      expect(typeof createSearchService).toBe('function');
    });

    it('exports SearchError as a class', () => {
      expect(typeof SearchError).toBe('function');
      const err = new SearchError(1001, 'test error');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(1001);
      expect(err.message).toBe('test error');
      expect(err.name).toBe('SearchError');
    });
  });
});
