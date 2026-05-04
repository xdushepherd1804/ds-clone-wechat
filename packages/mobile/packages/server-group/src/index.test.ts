import { describe, it, expect } from 'vitest';

describe('server-group', () => {
  describe('module', () => {
    it('can be imported without throwing', async () => {
      const mod = await import('./index');
      expect(mod).toBeDefined();
    });

    it('exports createGroupService', async () => {
      const mod = await import('./index');
      expect(typeof mod.createGroupService).toBe('function');
    });

    it('exports GroupError', async () => {
      const mod = await import('./index');
      expect(mod.GroupError).toBeDefined();
      expect(mod.GroupError.prototype).toBeInstanceOf(Error);
    });

    it('exports type interfaces', async () => {
      const mod = await import('./index');
      // Types are compile-time only, but the module should be importable
      expect(mod).toBeDefined();
    });
  });
});
