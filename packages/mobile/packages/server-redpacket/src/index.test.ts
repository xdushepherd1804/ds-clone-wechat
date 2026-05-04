import { describe, it, expect } from 'vitest';

describe('server-redpacket', () => {
  describe('module', () => {
    it('can be imported without throwing', async () => {
      const mod = await import('./index');
      expect(mod).toBeDefined();
    });

    it('exports createRedPacketService', async () => {
      const mod = await import('./index');
      expect(typeof mod.createRedPacketService).toBe('function');
    });

    it('exports RedPacketError', async () => {
      const mod = await import('./index');
      expect(mod.RedPacketError).toBeDefined();
      expect(mod.RedPacketError.prototype).toBeInstanceOf(Error);
    });

    it('exports type interfaces', async () => {
      const mod = await import('./index');
      expect(mod).toBeDefined();
    });
  });
});
