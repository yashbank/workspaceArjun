/**
 * Shared password policy — the single source of truth for what counts as a
 * strong password across reset-password, invite acceptance, and first-admin
 * bootstrap. Used both for live inline validation (the checklist UI) and for
 * the final submit/server-side gate.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRuleId = 'length' | 'uppercase' | 'lowercase' | 'number' | 'special';

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (pw: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (pw) => pw.length >= PASSWORD_MIN_LENGTH,
  },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  // Anything that isn't a letter or digit counts as a special character.
  { id: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export interface PasswordCheck {
  id: PasswordRuleId;
  label: string;
  passed: boolean;
}

/** Per-rule pass/fail state — drive the live requirements checklist UI from this. */
export function checkPassword(pw: string): PasswordCheck[] {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, passed: r.test(pw) }));
}

export interface PasswordValidation {
  ok: boolean;
  /** Human-readable labels of the rules that failed (empty when ok). */
  errors: string[];
}

export function validatePassword(pw: string): PasswordValidation {
  const errors = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
  return { ok: errors.length === 0, errors };
}

export function isPasswordValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

/** A single inline error message for the first unmet rule, or null when valid. */
export function firstPasswordError(pw: string): string | null {
  const failing = PASSWORD_RULES.find((r) => !r.test(pw));
  return failing ? `Password must have: ${failing.label.toLowerCase()}.` : null;
}
