import { randomBytes } from './crypto.rn';

const EPOCH = 1700000000000; // 2023-11-14T22:13:20.000Z — matching shared

/**
 * Generate a unique ID for use in the mobile app.
 * Format: <timestamp hex> + <16 random hex chars>
 * This avoids the Snowflake-style generator which depends on process.env.
 */
export function generateId(): string {
  const now = Date.now() - EPOCH;
  const timestampHex = now.toString(16).padStart(12, '0');
  const randomHex = randomBytes(8); // 16 hex chars
  return `${timestampHex}${randomHex}`;
}

/**
 * Extract approximate timestamp from a mobile-generated ID.
 */
export function extractTimestamp(id: string): number {
  const timestampHex = id.substring(0, 12);
  const ts = parseInt(timestampHex, 16) + EPOCH;
  return ts;
}
