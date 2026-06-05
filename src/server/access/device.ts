import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Cookie that carries the browser-bound device token (set httpOnly + secure). */
export const DEVICE_COOKIE_NAME = 'bpp_device';

/** Device token entropy in bytes (256-bit). */
export const DEVICE_TOKEN_BYTES = 32;

/** Generates a new high-entropy, URL-safe device token (the raw cookie value). */
export function generateDeviceToken(): string {
  return randomBytes(DEVICE_TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex hash of a device token. Only the hash is ever stored in the DB. */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time check that a raw token matches a stored hash. */
export function verifyDeviceToken(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = hashDeviceToken(token);
  if (actual.length !== expectedHash.length) return false;
  try {
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
  } catch {
    return false;
  }
}
