import { describe, it, expect } from 'vitest';
import {
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
  DEVICE_COOKIE_NAME,
} from './device';

describe('device token helpers', () => {
  it('generates distinct, non-trivial tokens', () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    // base64url: no +, /, or = padding
    expect(a).not.toMatch(/[+/=]/);
  });

  it('hashes deterministically (same input → same hash)', () => {
    expect(hashDeviceToken('abc')).toBe(hashDeviceToken('abc'));
    expect(hashDeviceToken('abc')).not.toBe(hashDeviceToken('abd'));
    // sha256 hex is 64 chars
    expect(hashDeviceToken('abc')).toHaveLength(64);
  });

  it('verifies a token against its own hash', () => {
    const token = generateDeviceToken();
    const hash = hashDeviceToken(token);
    expect(verifyDeviceToken(token, hash)).toBe(true);
  });

  it('rejects a wrong token, empty inputs, and length mismatch', () => {
    const hash = hashDeviceToken(generateDeviceToken());
    expect(verifyDeviceToken(generateDeviceToken(), hash)).toBe(false);
    expect(verifyDeviceToken('', hash)).toBe(false);
    expect(verifyDeviceToken('x', '')).toBe(false);
    expect(verifyDeviceToken('x', 'short')).toBe(false);
  });

  it('exposes a stable cookie name', () => {
    expect(DEVICE_COOKIE_NAME).toBe('bpp_device');
  });
});
