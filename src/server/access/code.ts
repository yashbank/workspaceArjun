import { randomBytes } from 'crypto';

/**
 * Access-code alphabet — uppercase letters + digits with visually ambiguous
 * characters removed (no O/0, I/1/L) so a code is easy to read aloud and type.
 */
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ACCESS_CODE_LENGTH = 8;

/**
 * Generates a strong, human-friendly access code (default 8 chars from a
 * 31-symbol unambiguous alphabet ≈ 40 bits). The Owner hands this to a member
 * to enroll a new device; only the Owner can ever see it. Uniform (rejection
 * sampling discards the biased tail of each random byte).
 */
export function generateAccessCode(length: number = ACCESS_CODE_LENGTH): string {
  const alphabet = ACCESS_CODE_ALPHABET;
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length - out.length)) {
      if (b < max) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}
