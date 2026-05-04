import { describe, it, expect } from 'vitest';
import { generateId, generateShortId, extractTimestamp } from './id-generator';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('returns a numeric string', () => {
    const id = generateId();
    expect(/^\d+$/.test(id)).toBe(true);
  });

  it('generates unique IDs on subsequent calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('IDs are monotonically increasing (larger timestamp = larger ID)', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(BigInt(id2)).toBeGreaterThan(BigInt(id1));
  });
});

describe('generateShortId', () => {
  it('returns a string', () => {
    const id = generateShortId();
    expect(typeof id).toBe('string');
  });

  it('returns exactly 16 characters', () => {
    for (let i = 0; i < 5; i++) {
      expect(generateShortId()).toHaveLength(16);
    }
  });

  it('only contains valid characters (0-9a-v)', () => {
    for (let i = 0; i < 10; i++) {
      expect(generateShortId()).toMatch(/^[0-9a-v]{16}$/);
    }
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateShortId());
    }
    expect(ids.size).toBeGreaterThan(90); // probabilistic, very unlikely to collide
  });
});

describe('extractTimestamp', () => {
  it('extracts timestamp from a snowflake ID', () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();
    const ts = extractTimestamp(id);
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('returns a number', () => {
    const id = generateId();
    expect(typeof extractTimestamp(id)).toBe('number');
  });

  it('returns a positive timestamp', () => {
    const id = generateId();
    expect(extractTimestamp(id)).toBeGreaterThan(1_700_000_000_000);
  });
});
