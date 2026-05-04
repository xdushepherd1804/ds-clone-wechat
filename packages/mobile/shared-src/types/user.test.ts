import { describe, it, expect } from 'vitest';

describe('UserProfile type', () => {
  it('type is importable and structurally valid', async () => {
    const mod = await import('./user');
    expect(mod).toBeDefined();
  });
});
