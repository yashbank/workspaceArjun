import { describe, it, expect } from 'vitest';
import { generateAccessCode, ACCESS_CODE_ALPHABET, ACCESS_CODE_LENGTH } from './code';

describe('generateAccessCode', () => {
  it('returns the default length', () => {
    expect(generateAccessCode()).toHaveLength(ACCESS_CODE_LENGTH);
  });

  it('honors a custom length', () => {
    expect(generateAccessCode(10)).toHaveLength(10);
    expect(generateAccessCode(5)).toHaveLength(5);
  });

  it('only uses the unambiguous alphabet (no O/0/I/1/L)', () => {
    const allowed = new Set(ACCESS_CODE_ALPHABET.split(''));
    for (let i = 0; i < 200; i++) {
      for (const ch of generateAccessCode()) expect(allowed.has(ch)).toBe(true);
    }
    for (const bad of ['O', '0', 'I', '1', 'L']) {
      expect(ACCESS_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it('is effectively unique across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateAccessCode());
    // 8 chars from 31 symbols — collisions in 5k draws should be vanishingly rare.
    expect(seen.size).toBe(5000);
  });
});
