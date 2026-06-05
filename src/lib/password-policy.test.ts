import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  isPasswordValid,
  checkPassword,
  firstPasswordError,
  PASSWORD_MIN_LENGTH,
} from './password-policy';

const STRONG = 'Str0ng!pass';

describe('password-policy', () => {
  it('accepts a password meeting every rule', () => {
    const result = validatePassword(STRONG);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(isPasswordValid(STRONG)).toBe(true);
    expect(firstPasswordError(STRONG)).toBeNull();
  });

  it(`rejects passwords shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
    const result = validatePassword('Aa1!aaa'); // 7 chars, otherwise valid
    expect(result.ok).toBe(false);
    expect(result.errors).toContain(`At least ${PASSWORD_MIN_LENGTH} characters`);
  });

  it('rejects a password with no uppercase letter', () => {
    const result = validatePassword('str0ng!pass');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('One uppercase letter');
  });

  it('rejects a password with no lowercase letter', () => {
    const result = validatePassword('STR0NG!PASS');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('One lowercase letter');
  });

  it('rejects a password with no number', () => {
    const result = validatePassword('Strong!pass');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('One number');
  });

  it('rejects a password with no special character', () => {
    const result = validatePassword('Str0ngpass');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('One special character');
  });

  it('reports every failing rule for a weak password', () => {
    const result = validatePassword('aaaa'); // too short, no upper/number/special
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        `At least ${PASSWORD_MIN_LENGTH} characters`,
        'One uppercase letter',
        'One number',
        'One special character',
      ]),
    );
  });

  it('checkPassword returns per-rule pass state', () => {
    const checks = checkPassword('str0ng!pass'); // missing uppercase only
    expect(checks).toHaveLength(5);
    expect(checks.find((c) => c.id === 'uppercase')?.passed).toBe(false);
    expect(checks.find((c) => c.id === 'lowercase')?.passed).toBe(true);
    expect(checks.find((c) => c.id === 'number')?.passed).toBe(true);
    expect(checks.find((c) => c.id === 'special')?.passed).toBe(true);
    expect(checks.find((c) => c.id === 'length')?.passed).toBe(true);
  });

  it('firstPasswordError surfaces a single actionable message', () => {
    expect(firstPasswordError('short')).toBe('Password must have: at least 8 characters.');
  });
});
