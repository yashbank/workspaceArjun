import { describe, expect, it } from 'vitest';

import { isLowStock } from './stock-predicates';

describe('R3-STK B17 isLowStock', () => {
  it('is at or below the reorder level', () => {
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(10.01, 10)).toBe(false);
  });
  it('0 is a valid level; null / undefined mean none is set', () => {
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(1, 0)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
    expect(isLowStock(0, undefined)).toBe(false);
  });
});
