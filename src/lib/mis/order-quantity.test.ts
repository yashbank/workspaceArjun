import { describe, expect, it } from 'vitest';

import { formatOrderQuantity, ORDER_UNITS, validateOrderQuantity } from './order-quantity';

describe('R2-264 order quantity', () => {
  it('the units are exactly pieces, kg and reams (owner decision)', () => {
    expect([...ORDER_UNITS]).toEqual(['PIECE', 'KG', 'REAM']);
  });
  it('refuses a missing, zero, negative or non-numeric quantity and an unknown unit', () => {
    expect(validateOrderQuantity(undefined, 'PIECE')).toMatch(/quantity/);
    expect(validateOrderQuantity(0, 'PIECE')).toMatch(/more than zero/);
    expect(validateOrderQuantity(-3, 'KG')).toMatch(/more than zero/);
    expect(validateOrderQuantity('abc', 'KG')).toMatch(/quantity/);
    expect(validateOrderQuantity(5, 'BOX')).toMatch(/Pieces, kg or Reams/);
    expect(validateOrderQuantity(5, null)).toMatch(/unit/);
  });
  it('accepts a positive number (or numeric string) with a listed unit', () => {
    expect(validateOrderQuantity(10000, 'PIECE')).toBeNull();
    expect(validateOrderQuantity('12.5', 'KG')).toBeNull();
  });
  it('formats for display, Indian grouping, and null when either half is missing', () => {
    expect(formatOrderQuantity(10000, 'PIECE')).toBe('10,000 Pieces');
    expect(formatOrderQuantity('12.5', 'KG')).toBe('12.5 kg');
    expect(formatOrderQuantity(null, 'KG')).toBeNull();
    expect(formatOrderQuantity(3, null)).toBeNull();
  });
});
