import { describe, it, expect } from 'vitest';

describe('Moments types', () => {
  it('module is importable', async () => {
    const mod = await import('./moments');
    expect(mod).toBeDefined();
  });
});
