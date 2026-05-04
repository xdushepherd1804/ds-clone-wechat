import { describe, it, expect } from 'vitest';
import {
  formatTime,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isToday,
  isYesterday,
  now,
  nowISO,
} from './time';

describe('formatTime', () => {
  it('formats a Date to HH:mm', () => {
    const d = new Date('2024-03-15T14:30:45');
    expect(formatTime(d)).toBe('14:30');
  });

  it('accepts a timestamp (number)', () => {
    const d = new Date('2024-03-15T09:05:00');
    expect(formatTime(d.getTime())).toBe('09:05');
  });

  it('accepts an ISO string', () => {
    expect(formatTime('2024-03-15T23:59:59')).toBe('23:59');
  });

  it('pads single-digit hours', () => {
    expect(formatTime(new Date('2024-03-15T03:07:00'))).toBe('03:07');
  });
});

describe('formatDate', () => {
  it('formats to YYYY-MM-DD', () => {
    expect(formatDate(new Date('2024-03-15'))).toBe('2024-03-15');
  });

  it('pads single-digit months and days', () => {
    expect(formatDate(new Date('2024-01-05'))).toBe('2024-01-05');
  });

  it('accepts a string', () => {
    expect(formatDate('2024-12-31')).toBe('2024-12-31');
  });
});

describe('formatDateTime', () => {
  it('combines date and time', () => {
    const d = new Date('2024-03-15T14:30:00');
    expect(formatDateTime(d)).toBe('2024-03-15 14:30');
  });
});

describe('formatRelativeTime', () => {
  const nowDate = new Date('2024-06-15T12:00:00');

  it('returns 刚刚 for less than a minute', () => {
    expect(formatRelativeTime(new Date('2024-06-15T11:59:30'), nowDate)).toBe('刚刚');
    expect(formatRelativeTime(new Date('2024-06-15T11:59:01'), nowDate)).toBe('刚刚');
  });

  it('returns N分钟前 for less than an hour', () => {
    expect(formatRelativeTime(new Date('2024-06-15T11:50:00'), nowDate)).toBe('10分钟前');
    expect(formatRelativeTime(new Date('2024-06-15T11:01:00'), nowDate)).toBe('59分钟前');
  });

  it('returns N小时前 for less than a day', () => {
    expect(formatRelativeTime(new Date('2024-06-15T08:00:00'), nowDate)).toBe('4小时前');
    expect(formatRelativeTime(new Date('2024-06-14T23:00:00'), nowDate)).toBe('13小时前');
  });

  it('returns 昨天 for yesterday', () => {
    expect(formatRelativeTime(new Date('2024-06-14T10:00:00'), nowDate)).toBe('昨天');
  });

  it('returns MM-DD for this year', () => {
    expect(formatRelativeTime(new Date('2024-03-15T10:00:00'), nowDate)).toBe('03-15');
  });

  it('returns YYYY-MM-DD for previous years', () => {
    expect(formatRelativeTime(new Date('2023-12-25T10:00:00'), nowDate)).toBe('2023-12-25');
  });
});

describe('isToday', () => {
  it('returns true for today', () => {
    expect(isToday(new Date())).toBe(true);
  });

  it('returns false for yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isToday(yesterday)).toBe(false);
  });

  it('accepts a timestamp', () => {
    expect(isToday(Date.now())).toBe(true);
  });

  it('accepts an ISO string', () => {
    expect(isToday(new Date().toISOString())).toBe(true);
  });
});

describe('isYesterday', () => {
  it('returns true for yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it('returns false for today', () => {
    expect(isYesterday(new Date())).toBe(false);
  });

  it('returns false for 2 days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(isYesterday(twoDaysAgo)).toBe(false);
  });
});

describe('now', () => {
  it('returns a number close to Date.now()', () => {
    const ts = now();
    const actual = Date.now();
    expect(Math.abs(ts - actual)).toBeLessThan(10);
  });
});

describe('nowISO', () => {
  it('returns an ISO 8601 formatted string', () => {
    const iso = nowISO();
    expect(iso).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('can be parsed back to a valid date', () => {
    const iso = nowISO();
    const d = new Date(iso);
    expect(d.getTime()).not.toBeNaN();
  });
});
