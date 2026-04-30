export function isValidUsername(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(value);
}

export function isValidPassword(value: string): boolean {
  return value.length >= 6 && value.length <= 128 && /\S{6,}/.test(value);
}

export function isValidNickname(value: string): boolean {
  return value.length >= 1 && value.length <= 50 && value.trim().length > 0;
}

export function isValidPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function isValidMsgContent(value: string, maxLength = 5000): boolean {
  return value.length > 0 && value.length <= maxLength && value.trim().length > 0;
}

export function sanitizeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
