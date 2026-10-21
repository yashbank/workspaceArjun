import { describe, expect, it } from 'vitest';

import { RETURN_REASON_REQUIRED, returnStartsAccepted, validateReturn } from './store-return';

describe('validateReturn', () => {
  it('needs a positive quantity (rounded to 2 dp) and a reason', () => {
    expect(validateReturn({ qty: 2.499, reason: ' leftover ' })).toEqual({ qty: 2.5, reason: 'leftover' });
  });
  it('refuses zero, negative, NaN quantities', () => {
    for (const q of [0, -3, Number.NaN, 0.004, 'x']) expect(() => validateReturn({ qty: q, reason: 'leftover' })).toThrow(/more than zero/);
  });
  it('refuses a missing or one-word-too-short reason', () => {
    expect(() => validateReturn({ qty: 1, reason: '' })).toThrow(RETURN_REASON_REQUIRED);
    expect(() => validateReturn({ qty: 1, reason: 'no' })).toThrow(RETURN_REASON_REQUIRED);
    expect(() => validateReturn({ qty: 1, reason: null })).toThrow(RETURN_REASON_REQUIRED);
  });
});

describe('returnStartsAccepted', () => {
  it('only a store.write holder books stock straight back', () => {
    expect(returnStartsAccepted(true)).toBe(true);
    expect(returnStartsAccepted(false)).toBe(false);
  });
});
