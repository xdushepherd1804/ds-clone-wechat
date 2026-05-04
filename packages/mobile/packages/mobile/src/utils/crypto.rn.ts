import * as Crypto from 'expo-crypto';

/**
 * Generate a short random ID (16 chars from a custom alphabet).
 * Uses expo-crypto.randomUUID as source of randomness.
 */
export function generateShortId(): string {
  const uuid = Crypto.randomUUID();
  const hex = uuid.replace(/-/g, '');
  const chars = '0123456789abcdefghijklmnopqrstuv';
  let result = '';
  for (let i = 0; i < 16; i++) {
    const index = parseInt(hex.substring(i * 2, i * 2 + 2), 16) % 32;
    result += chars[index];
  }
  return result;
}

/**
 * Generate random bytes and return as hex string.
 * Uses expo-crypto.getRandomBytes.
 */
export function randomBytes(length: number): string {
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a UUID v4 string using expo-crypto.
 */
export function randomUUID(): string {
  return Crypto.randomUUID();
}
