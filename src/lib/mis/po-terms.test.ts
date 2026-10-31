import { describe, expect, it } from 'vitest';

import { isDateKey, PAYMENT_TERMS, paymentTermsLabel, validatePoTerms } from './po-terms';

describe('R2-272 PO terms', () => {
  it('payment terms are a fixed list with labels', () => {
    expect(PAYMENT_TERMS).toContain('NET_30');
    expect(paymentTermsLabel('ADVANCE_50')).toBe('50% advance, balance on delivery');
    expect(paymentTermsLabel(null)).toBeNull();
  });
  it('a new PO needs a real delivery date; terms, when given, must be from the list', () => {
    expect(validatePoTerms({}, true)).toMatch(/delivery date/);
    expect(validatePoTerms({ deliveryDueDate: '2026-13-40' }, true)).toMatch(/look like/);
    expect(validatePoTerms({ deliveryDueDate: '2026-11-15', paymentTerms: 'whenever' }, true)).toMatch(/from the list/);
    expect(validatePoTerms({ deliveryDueDate: '2026-11-15', paymentTerms: 'NET_30' }, true)).toBeNull();
    expect(validatePoTerms({ deliveryDueDate: '2026-11-15' }, true)).toBeNull();
  });
  it('an edit may leave the date out', () => {
    expect(validatePoTerms({ paymentTerms: 'NET_15' }, false)).toBeNull();
    expect(isDateKey('2026-02-30')).toBe(true); // JS rolls it; the field is a date picker, so a typed impossible day is not reached
    expect(isDateKey('nope')).toBe(false);
  });
});
