import { describe, it, expect } from 'vitest';
import {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateSearch,
} from './validation';

describe('validateRegister', () => {
  it('passes valid input', () => {
    expect(validateRegister({
      username: 'testuser',
      password: 'password123',
      nickname: 'Test User',
    })).toHaveLength(0);
  });

  it('rejects missing username', () => {
    const errors = validateRegister({ password: 'password123', nickname: 'Test' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('username');
  });

  it('rejects non-string username', () => {
    const errors = validateRegister({ username: 123, password: 'password123', nickname: 'Test' });
    expect(errors.some((e) => e.field === 'username')).toBe(true);
  });

  it('rejects invalid username format', () => {
    const errors = validateRegister({ username: '1baduser', password: 'password123', nickname: 'Test' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('username');
  });

  it('rejects missing password', () => {
    const errors = validateRegister({ username: 'testuser', nickname: 'Test' });
    expect(errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('rejects too-short password', () => {
    const errors = validateRegister({ username: 'testuser', password: '1234567', nickname: 'Test' });
    expect(errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('rejects missing nickname', () => {
    const errors = validateRegister({ username: 'testuser', password: 'password123' });
    expect(errors.some((e) => e.field === 'nickname')).toBe(true);
  });

  it('rejects empty nickname string', () => {
    const errors = validateRegister({ username: 'testuser', password: 'password123', nickname: '' });
    expect(errors.some((e) => e.field === 'nickname')).toBe(true);
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const errors = validateRegister({});
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateLogin', () => {
  it('passes valid input', () => {
    expect(validateLogin({
      username: 'testuser',
      password: 'password123',
    })).toHaveLength(0);
  });

  it('rejects missing username', () => {
    const errors = validateLogin({ password: 'password123' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('username');
  });

  it('rejects non-string username', () => {
    const errors = validateLogin({ username: 456, password: 'password123' });
    expect(errors.some((e) => e.field === 'username')).toBe(true);
  });

  it('rejects missing password', () => {
    const errors = validateLogin({ username: 'testuser' });
    expect(errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('rejects non-string password', () => {
    const errors = validateLogin({ username: 'testuser', password: 123456 });
    expect(errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('returns both errors when both fields missing', () => {
    const errors = validateLogin({});
    expect(errors).toHaveLength(2);
  });
});

describe('validateUpdateProfile', () => {
  it('passes valid nickname update', () => {
    expect(validateUpdateProfile({ nickname: 'New Name' })).toHaveLength(0);
  });

  it('passes valid phone update', () => {
    expect(validateUpdateProfile({ phone: '13800138000' })).toHaveLength(0);
  });

  it('passes null phone (unset)', () => {
    expect(validateUpdateProfile({ phone: null })).toHaveLength(0);
  });

  it('passes empty body', () => {
    expect(validateUpdateProfile({})).toHaveLength(0);
  });

  it('rejects empty string nickname', () => {
    const errors = validateUpdateProfile({ nickname: '' });
    expect(errors.some((e) => e.field === 'nickname')).toBe(true);
  });

  it('rejects non-string phone', () => {
    const errors = validateUpdateProfile({ phone: 123456 });
    expect(errors.some((e) => e.field === 'phone')).toBe(true);
  });
});

describe('validateChangePassword', () => {
  it('passes valid input', () => {
    expect(validateChangePassword({
      oldPassword: 'oldpass123',
      newPassword: 'newpass456',
    })).toHaveLength(0);
  });

  it('rejects missing old password', () => {
    const errors = validateChangePassword({ newPassword: 'newpass456' });
    expect(errors.some((e) => e.field === 'oldPassword')).toBe(true);
  });

  it('rejects missing new password', () => {
    const errors = validateChangePassword({ oldPassword: 'oldpass123' });
    expect(errors.some((e) => e.field === 'newPassword')).toBe(true);
  });

  it('rejects too-short new password', () => {
    const errors = validateChangePassword({ oldPassword: 'oldpass123', newPassword: 'short' });
    expect(errors.some((e) => e.field === 'newPassword')).toBe(true);
  });

  it('rejects non-string oldPassword', () => {
    const errors = validateChangePassword({ oldPassword: 123, newPassword: 'newpass456' });
    expect(errors.some((e) => e.field === 'oldPassword')).toBe(true);
  });
});

describe('validateSearch', () => {
  it('passes valid query', () => {
    expect(validateSearch({ query: 'alice' })).toHaveLength(0);
  });

  it('rejects missing query', () => {
    const errors = validateSearch({});
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('query');
  });

  it('rejects empty string query', () => {
    const errors = validateSearch({ query: '' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('query');
  });

  it('rejects whitespace-only query', () => {
    const errors = validateSearch({ query: '   ' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('query');
  });

  it('rejects non-string query', () => {
    const errors = validateSearch({ query: 123 });
    expect(errors.some((e) => e.field === 'query')).toBe(true);
  });
});
