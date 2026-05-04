import { describe, it, expect } from 'vitest';
import { MsgType, MsgStatus, ChatType } from './message';

describe('MsgType', () => {
  it('TEXT is 1', () => {
    expect(MsgType.TEXT).toBe(1);
  });

  it('SYSTEM is 100', () => {
    expect(MsgType.SYSTEM).toBe(100);
  });

  it('CUSTOM is 200', () => {
    expect(MsgType.CUSTOM).toBe(200);
  });

  it('has 9 members', () => {
    const numericValues = Object.values(MsgType).filter((v) => typeof v === 'number');
    expect(numericValues).toHaveLength(9);
  });

  it('all enum values are unique', () => {
    const values = Object.values(MsgType).filter((v) => typeof v === 'number');
    expect(new Set(values).size).toBe(values.length);
  });

  it('standard types (< 100) and system types (>= 100) are separated', () => {
    const standardTypes = [
      MsgType.TEXT,
      MsgType.IMAGE,
      MsgType.VOICE,
      MsgType.VIDEO,
      MsgType.FILE,
      MsgType.LOCATION,
      MsgType.LINK,
    ];
    for (const t of standardTypes) {
      expect(t).toBeLessThan(100);
    }
    expect(MsgType.SYSTEM).toBeGreaterThanOrEqual(100);
    expect(MsgType.CUSTOM).toBeGreaterThanOrEqual(100);
  });
});

describe('MsgStatus', () => {
  it('all status values are unique', () => {
    const values = Object.values(MsgStatus);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has 5 status values', () => {
    expect(Object.values(MsgStatus)).toHaveLength(5);
  });
});

describe('ChatType', () => {
  it('has PRIVATE and GROUP', () => {
    expect(ChatType.PRIVATE).toBe('private');
    expect(ChatType.GROUP).toBe('group');
  });
});
