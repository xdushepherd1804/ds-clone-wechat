import { describe, it, expect } from 'vitest';

describe('server-moments', () => {
  describe('module', () => {
    it('can be imported without throwing', async () => {
      const mod = await import('./index');
      expect(mod).toBeDefined();
    });

    it('is an object', async () => {
      const mod = await import('./index');
      expect(typeof mod).toBe('object');
    });

    it('exports createMomentsService', async () => {
      const mod = await import('./index');
      expect(mod.createMomentsService).toBeDefined();
      expect(typeof mod.createMomentsService).toBe('function');
    });

    it('exports MomentError', async () => {
      const mod = await import('./index');
      expect(mod.MomentError).toBeDefined();
      expect(typeof mod.MomentError).toBe('function');
    });
  });
});
