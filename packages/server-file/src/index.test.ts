import { describe, it, expect } from 'vitest';

describe('server-file', () => {
  describe('module', () => {
    it('can be imported without throwing', async () => {
      const mod = await import('./index');
      expect(mod).toBeDefined();
    });

    it('exports createFileService', async () => {
      const mod = await import('./index');
      expect(mod.createFileService).toBeDefined();
      expect(typeof mod.createFileService).toBe('function');
    });

    it('exports FileError', async () => {
      const mod = await import('./index');
      expect(mod.FileError).toBeDefined();
    });
  });
});
