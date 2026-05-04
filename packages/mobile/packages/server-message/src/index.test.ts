import { describe, it, expect } from 'vitest';
import { createMessageService, MessageError } from './index';

describe('server-message', () => {
  describe('module exports', () => {
    it('exports createMessageService as a function', () => {
      expect(typeof createMessageService).toBe('function');
    });

    it('exports MessageError as a class', () => {
      expect(typeof MessageError).toBe('function');
      const err = new MessageError(1001, 'test error');
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(1001);
      expect(err.message).toBe('test error');
    });
  });
});
