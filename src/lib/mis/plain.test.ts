import { describe, expect, it } from 'vitest';

import { toPlain } from './plain';

/** What Prisma's Decimal looks like to this code: a class instance with `toNumber`. */
class FakeDecimal {
  constructor(private n: number) {}
  toNumber() { return this.n; }
}
const dec = (n: number) => new FakeDecimal(n);

describe('toPlain — a row that can cross to a Client Component', () => {
  it('turns a Decimal into a number, at any depth, inside arrays and nested objects', () => {
    const out = toPlain({ id: 'a', qty: dec(2.5), items: [{ rate: dec(10), item: { reorder: dec(0) } }] });
    expect(out).toEqual({ id: 'a', qty: 2.5, items: [{ rate: 10, item: { reorder: 0 } }] });
  });

  it('the result is made only of plain objects, arrays, primitives and Dates — nothing React would refuse', () => {
    const at = new Date('2026-09-01T00:00:00Z');
    const out = toPlain({ a: dec(1), when: at, list: [dec(2)], nothing: null, undef: undefined, s: 'x', b: true });
    const walk = (v: unknown): void => {
      if (v === null || typeof v !== 'object') return;
      if (v instanceof Date) return;
      expect([Object.prototype, Array.prototype, null]).toContain(Object.getPrototypeOf(v));
      Object.values(v).forEach(walk);
    };
    walk(out);
    expect(out.when).toBe(at);
    expect(out.nothing).toBeNull();
    expect(out.undef).toBeUndefined();
  });

  it('a zero Decimal is 0, not dropped or null', () => {
    expect(toPlain({ q: dec(0) })).toEqual({ q: 0 });
  });

  it('does not mutate its input, so a server-side .toNumber() after the call still works', () => {
    const row = { q: dec(4) };
    toPlain(row);
    expect(row.q.toNumber()).toBe(4);
  });

  it('a Date is not mistaken for a Decimal', () => {
    const d = new Date(0);
    expect(toPlain(d)).toBe(d);
  });

  it('numbers, strings, null and booleans pass through', () => {
    for (const v of [1, 'a', null, true, undefined]) expect(toPlain(v)).toBe(v);
  });
});
