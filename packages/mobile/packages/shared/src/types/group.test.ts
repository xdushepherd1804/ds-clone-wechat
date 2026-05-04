import { describe, it, expect } from 'vitest';

describe('Group types', () => {
  it('module is importable', async () => {
    const mod = await import('./group');
    expect(mod).toBeDefined();
  });
});
