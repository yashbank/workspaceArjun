import { describe, expect, it } from 'vitest';

import { cappedIssueQty, isOrderIssuable, linesRefusedForOrder } from './material-request';

describe('order-issuable categories', () => {
  it('raw material and consumables may go to an order; equipment and others may not', () => {
    expect(isOrderIssuable('RAW_MATERIAL')).toBe(true);
    expect(isOrderIssuable('CONSUMABLE')).toBe(true);
    expect(isOrderIssuable('EQUIPMENT')).toBe(false);
    expect(isOrderIssuable('OTHER')).toBe(false);
  });

  it('names the offending lines only when an order is set', () => {
    const lines = [
      { name: 'Kraft', category: 'RAW_MATERIAL' },
      { name: 'Die', category: 'EQUIPMENT' },
      { name: 'Broom', category: 'OTHER' },
    ];
    expect(linesRefusedForOrder(lines, 'o1')).toEqual(['Die', 'Broom']);
    expect(linesRefusedForOrder(lines, null)).toEqual([]);
  });
});

describe('capped issue', () => {
  it('allows 0 up to the requested qty', () => {
    expect(cappedIssueQty(10, 0)).toBe(0);
    expect(cappedIssueQty(10, 10)).toBe(10);
    expect(cappedIssueQty(10, 7.5)).toBe(7.5);
  });
  it('refuses over-issue and negatives', () => {
    expect(() => cappedIssueQty(10, 10.01)).toThrow(/only 10 was requested/);
    expect(() => cappedIssueQty(10, -1)).toThrow(/negative/);
    expect(() => cappedIssueQty(10, Number.NaN)).toThrow();
  });
});
