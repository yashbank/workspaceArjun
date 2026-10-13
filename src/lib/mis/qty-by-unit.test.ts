import { describe, expect, it } from 'vitest';

import { formatQtyByUnit, normaliseUnit, sumByUnit } from './qty-by-unit';

describe('sumByUnit (R3-QCR B76)', () => {
  it('500 PIECE + 200 KG is two rows, never 700', () => {
    const out = sumByUnit([
      { qty: 500, unit: 'PIECE' },
      { qty: 200, unit: 'KG' },
    ]);
    expect(out).toEqual([
      { unit: 'KG', qty: 200 },
      { unit: 'PIECE', qty: 500 },
    ]);
    expect(out.some((r) => r.qty === 700)).toBe(false);
  });

  it('the same unit in different case or with padding is merged', () => {
    expect(sumByUnit([{ qty: 10, unit: 'kg' }, { qty: 5.5, unit: ' KG ' }, { qty: 1, unit: 'Kg' }])).toEqual([{ unit: 'KG', qty: 16.5 }]);
  });

  it('rounds to 2 dp and skips non-finite quantities', () => {
    expect(sumByUnit([{ qty: 0.1, unit: 'KG' }, { qty: 0.2, unit: 'KG' }, { qty: Number.NaN, unit: 'KG' }])).toEqual([{ unit: 'KG', qty: 0.3 }]);
  });

  it('a row with no unit is kept visible under its own label, not dropped', () => {
    expect(sumByUnit([{ qty: 3, unit: null }, { qty: 2, unit: '' }])).toEqual([{ unit: '—', qty: 5 }]);
    expect(normaliseUnit(undefined)).toBe('—');
  });
});

describe('formatQtyByUnit', () => {
  it('joins the units, Indian digit grouping', () => {
    expect(formatQtyByUnit([{ unit: 'KG', qty: 12500.5 }, { unit: 'PIECE', qty: 500 }])).toBe('12,500.5 KG · 500 PIECE');
  });
  it('an empty list reads as a dash', () => {
    expect(formatQtyByUnit([])).toBe('—');
  });
});
