import { describe, expect, it } from 'vitest';

import { MONEY_FIELDS, withoutMoneyFields } from './money-fields';

/** Stands in for Prisma's Decimal: a class instance, not a plain object. */
class Dec {
  constructor(private n: number) {}
  toNumber() { return this.n; }
}

describe('withoutMoneyFields', () => {
  it('removes the key — it is absent, not null and not blank', () => {
    const out = withoutMoneyFields({ id: 'a', ratePerUnit: 10, pricePerUnit: 5, name: 'Board' });
    expect(out).toEqual({ id: 'a', name: 'Board' });
    expect('ratePerUnit' in out).toBe(false);
    expect('pricePerUnit' in out).toBe(false);
  });

  it('a value of 0 or null is removed too — presence would itself say "a rate exists"', () => {
    expect(withoutMoneyFields({ ratePerUnit: 0, pricePerUnit: null, id: 1 })).toEqual({ id: 1 });
  });

  it('reaches any depth and every element of an array', () => {
    const out = withoutMoneyFields({ po: { items: [{ id: 1, ratePerUnit: 9 }, { id: 2, item: { pricePerUnit: 3, name: 'x' } }] } });
    expect(JSON.stringify(out)).not.toMatch(/ratePerUnit|pricePerUnit/);
    expect(out).toEqual({ po: { items: [{ id: 1 }, { id: 2, item: { name: 'x' } }] } });
  });

  it('leaves Dates and Decimals alone (a class instance is a leaf, not a bag of keys)', () => {
    const at = new Date('2026-09-01T00:00:00Z');
    const qty = new Dec(4);
    const out = withoutMoneyFields({ at, qty, ratePerUnit: new Dec(1) }) as { at: Date; qty: Dec };
    expect(out.at).toBe(at);
    expect(out.qty).toBe(qty);
  });

  it('does not mutate what it was given', () => {
    const row = { id: 1, items: [{ ratePerUnit: 7 }] };
    withoutMoneyFields(row);
    expect(row.items[0].ratePerUnit).toBe(7);
  });

  it('passes through primitives, null and undefined', () => {
    expect(withoutMoneyFields(null)).toBeNull();
    expect(withoutMoneyFields(undefined)).toBeUndefined();
    expect(withoutMoneyFields(3)).toBe(3);
    expect(withoutMoneyFields('ratePerUnit')).toBe('ratePerUnit');
  });

  it('names exactly the two material-price keys', () => {
    expect([...MONEY_FIELDS]).toEqual(['ratePerUnit', 'pricePerUnit']);
  });
});
