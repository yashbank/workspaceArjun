import { describe, expect, it } from 'vitest';

import { foldAllocationFigures, issueRefusal, orderNumberFromRef, remainingAllocation } from './order-allocation';

describe('orderNumberFromRef', () => {
  it('accepts an order number in any case or with spaces, and refuses anything else', () => {
    expect(orderNumberFromRef(' ord-202610-12345 ')).toBe('ORD-202610-12345');
    expect(orderNumberFromRef('BOM-500')).toBeNull();
    expect(orderNumberFromRef(null)).toBeNull();
    expect(orderNumberFromRef('ORD-202610-1234')).toBeNull();
  });
});

describe('foldAllocationFigures', () => {
  it('counts only issues from the first earmark onward, per key', () => {
    const t = (h: number) => new Date(2026, 9, 9, h);
    const f = foldAllocationFigures(
      [{ k: 'a', allocatedQty: 50, createdAt: t(10) }, { k: 'a', allocatedQty: 20, createdAt: t(12) }],
      [{ k: 'a', changeQty: -100, createdAt: t(9) }, { k: 'a', changeQty: -30, createdAt: t(11) }, { k: 'b', changeQty: -5, createdAt: t(11) }],
      { allocation: (a) => a.k, issue: (i) => i.k },
    );
    expect(f.get('a')).toEqual({ allocated: 70, issued: 30 });
    expect(f.has('b')).toBe(false);
  });
});

describe('the cap', () => {
  it('exact remaining is allowed, one paisa over is refused', () => {
    expect(issueRefusal({ allocated: 100, issued: 40 }, 60, 'Kraft')).toBeNull();
    expect(issueRefusal({ allocated: 100, issued: 40 }, 60.01, 'Kraft')).toMatch(/only 60 of the 100/);
  });
  it('an item with no allocation on this order is not capped here', () => {
    expect(issueRefusal({ allocated: 0, issued: 0 }, 5, 'Kraft')).toBeNull();
  });
  it('remaining never drifts past 2dp', () => {
    expect(remainingAllocation({ allocated: 10.1, issued: 3.3 })).toBe(6.8);
  });
});
