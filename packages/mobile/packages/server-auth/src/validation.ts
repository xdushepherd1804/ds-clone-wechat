import { isValidUsername, isValidPassword, isValidNickname } from '@wechat-clone/shared';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateRegister(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!body.username || typeof body.username !== 'string') {
    errors.push({ field: 'username', message: '用户名不能为空' });
  } else if (!isValidUsername(body.username)) {
    errors.push({ field: 'username', message: '用户名格式不正确 (字母开头, 3-20位)' });
  }
  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: '密码不能为空' });
  } else if (!isValidPassword(body.password) || body.password.length < 8) {
    errors.push({ field: 'password', message: '密码长度至少8位' });
  }
  if (!body.nickname || typeof body.nickname !== 'string') {
    errors.push({ field: 'nickname', message: '昵称不能为空' });
  } else if (!isValidNickname(body.nickname)) {
    errors.push({ field: 'nickname', message: '昵称格式不正确' });
  }
  return errors;
}

export function validateLogin(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!body.username || typeof body.username !== 'string') {
    errors.push({ field: 'username', message: '用户名不能为空' });
  }
  if (!body.password || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: '密码不能为空' });
  }
  return errors;
}

export function validateUpdateProfile(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (body.nickname !== undefined) {
    if (typeof body.nickname !== 'string' || !isValidNickname(body.nickname)) {
      errors.push({ field: 'nickname', message: '昵称不能为空' });
    }
  }
  if (body.phone !== undefined && body.phone !== null) {
    if (typeof body.phone !== 'string') {
      errors.push({ field: 'phone', message: '手机号格式不正确' });
    }
  }
  return errors;
}

export function validateChangePassword(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!body.oldPassword || typeof body.oldPassword !== 'string') {
    errors.push({ field: 'oldPassword', message: '原密码不能为空' });
  }
  if (!body.newPassword || typeof body.newPassword !== 'string') {
    errors.push({ field: 'newPassword', message: '新密码不能为空' });
  } else if (!isValidPassword(body.newPassword) || body.newPassword.length < 8) {
    errors.push({ field: 'newPassword', message: '新密码长度至少8位' });
  }
  return errors;
}

export function validateSearch(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!body.query || typeof body.query !== 'string' || body.query.trim().length === 0) {
    errors.push({ field: 'query', message: '搜索关键词不能为空' });
  }
  return errors;
}
