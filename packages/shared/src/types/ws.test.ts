import { describe, it, expect } from 'vitest';

describe('WS types', () => {
  it('module is importable', async () => {
    const mod = await import('./ws');
    expect(mod).toBeDefined();
  });
});
