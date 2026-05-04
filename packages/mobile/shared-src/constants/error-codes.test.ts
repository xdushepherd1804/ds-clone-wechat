import { describe, it, expect } from 'vitest';
import { ErrorCode, ErrorMessage } from './error-codes';

describe('ErrorCode', () => {
  it('SUCCESS is 0', () => {
    expect(ErrorCode.SUCCESS).toBe(0);
  });

  it('all error codes are non-zero (except SUCCESS)', () => {
    const codes = Object.entries(ErrorCode)
      .filter(([key]) => key !== 'SUCCESS')
      .map(([, val]) => val);
    for (const code of codes) {
      expect(code).not.toBe(0);
    }
  });

  it('has unique values for every error code', () => {
    const values = Object.values(ErrorCode);
    expect(new Set(values).size).toBe(values.length);
  });

  describe('category ranges', () => {
    it('general errors are in 1xxx range', () => {
      expect(ErrorCode.UNKNOWN).toBeGreaterThanOrEqual(1000);
      expect(ErrorCode.UNKNOWN).toBeLessThan(2000);
      expect(ErrorCode.INVALID_PARAM).toBeGreaterThanOrEqual(1000);
      expect(ErrorCode.INVALID_PARAM).toBeLessThan(2000);
    });

    it('auth errors are in 2xxx range', () => {
      expect(ErrorCode.UNAUTHORIZED).toBeGreaterThanOrEqual(2000);
      expect(ErrorCode.UNAUTHORIZED).toBeLessThan(3000);
      expect(ErrorCode.TOKEN_EXPIRED).toBeGreaterThanOrEqual(2000);
      expect(ErrorCode.TOKEN_EXPIRED).toBeLessThan(3000);
    });

    it('message errors are in 3xxx range', () => {
      expect(ErrorCode.MSG_SEND_FAILED).toBeGreaterThanOrEqual(3000);
      expect(ErrorCode.MSG_SEND_FAILED).toBeLessThan(4000);
    });

    it('contact errors are in 4xxx range', () => {
      expect(ErrorCode.CONTACT_ALREADY_EXISTS).toBeGreaterThanOrEqual(4000);
      expect(ErrorCode.CONTACT_ALREADY_EXISTS).toBeLessThan(5000);
    });

    it('group errors are in 5xxx range', () => {
      expect(ErrorCode.GROUP_NOT_FOUND).toBeGreaterThanOrEqual(5000);
      expect(ErrorCode.GROUP_NOT_FOUND).toBeLessThan(6000);
    });

    it('moment errors are in 6xxx range', () => {
      expect(ErrorCode.MOMENT_NOT_FOUND).toBeGreaterThanOrEqual(6000);
      expect(ErrorCode.MOMENT_NOT_FOUND).toBeLessThan(7000);
    });

    it('file errors are in 7xxx range', () => {
      expect(ErrorCode.FILE_TOO_LARGE).toBeGreaterThanOrEqual(7000);
      expect(ErrorCode.FILE_TOO_LARGE).toBeLessThan(8000);
    });
  });
});

describe('ErrorMessage', () => {
  it('has a message for every error code', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ErrorMessage[code]).toBeDefined();
    }
  });

  it('has no extra messages beyond defined error codes', () => {
    const msgKeys = Object.keys(ErrorMessage).map(Number);
    const codeValues = Object.values(ErrorCode);
    for (const key of msgKeys) {
      expect(codeValues).toContain(key);
    }
  });

  it('SUCCESS message is "success"', () => {
    expect(ErrorMessage[ErrorCode.SUCCESS]).toBe('success');
  });

  it('all non-success messages are non-empty Chinese strings', () => {
    for (const [code, msg] of Object.entries(ErrorMessage)) {
      if (Number(code) !== ErrorCode.SUCCESS) {
        expect(msg.length).toBeGreaterThan(0);
        expect(/[一-鿿]/.test(msg)).toBe(true);
      }
    }
  });
});
