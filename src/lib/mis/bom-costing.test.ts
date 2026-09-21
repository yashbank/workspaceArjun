/**
 * Phase 24C · D6 — the costing maths, pinned to the artboard's own figures.
 *
 * D6's claims that a picture cannot enforce: "not priced" is a fact and ₹0 is a lie; a total with
 * an unpriced item is a FLOOR; and the arithmetic must not drift by a paisa.
 */
import { describe, expect, it } from 'vitest';

import { formatRupees, lineCost, rollUp, withoutRates, type CostStage } from './bom-costing';

describe('lineCost', () => {
  it('quantity × rate, in paise: 1,240 Kg at ₹159.35 is ₹1,97,594.00', () => {
    expect(lineCost(1240, 159.35)).toBe(19_759_400);
  });

  it('is exact where floats drift: 3 × ₹0.10 is 30 paise, not 30.000000000000004', () => {
    expect(lineCost(3, 0.1)).toBe(30);
    expect(0.1 * 3).not.toBe(0.3); // the float trap this guards against is real
  });

  it.each([
    [0.05, 0.7, 4], //  0.035 rupees = 3.5 paise exactly → 4
    [0.05, 2.9, 15], // 0.145 rupees = 14.5 paise exactly → 15
    [0.06, 2.75, 17], // 0.165 rupees = 16.5 paise exactly → 17
  ])('half a paisa rounds UP, exactly: %f × ₹%f is %i paise — floats get these wrong', (qty, rate, paise) => {
    expect(lineCost(qty, rate)).toBe(paise);
    // The float product lands just BELOW the half and rounds the wrong way — the trap integer paise avoids.
    expect(Math.round(qty * rate * 100)).toBe(paise - 1);
  });

  it('takes Decimal-likes and strings, as Prisma hands them over', () => {
    expect(lineCost('24.80', { toString: () => '1680.00', valueOf: () => 1680 })).toBe(4_166_400);
  });

  it('NO rate is NOT free: null and undefined are unpriced (D6 — "not priced is a fact; ₹0 is a lie")', () => {
    expect(lineCost(400, null)).toBeNull();
    expect(lineCost(400, undefined)).toBeNull();
  });

  it('a rate that IS recorded as 0 is a real figure — a free-issue material — and is priced at 0, not unpriced', () => {
    expect(lineCost(400, 0)).toBe(0);
    expect(lineCost(400, '0.00')).toBe(0);
  });

  it('an unusable quantity is unpriced rather than NaN', () => {
    expect(lineCost(null, 10)).toBeNull();
    expect(lineCost('abc', 10)).toBeNull();
    expect(lineCost(Number.NaN, 10)).toBeNull();
  });

  it('rounds half a paisa consistently, and never returns a fraction of a paisa', () => {
    expect(Number.isInteger(lineCost(0.333, 1.111)!)).toBe(true);
  });
});

/** D6's tree: printed sheet (board, CMYK, spot), lamination, adhesive, and an outer carton with NO rate. */
const D6: CostStage[] = [
  { id: 'sheet', materials: [
    { id: 'fbb', quantity: 1240, ratePerUnit: 159.35 },   // ₹1,97,594.00 (the artboard prints ₹1,98,400 at its own rate)
    { id: 'cmyk', quantity: 24.8, ratePerUnit: 1680 },    // ₹41,664.00
    { id: 'spot', quantity: 6.4, ratePerUnit: 3340.63 },  // ₹21,380.03 (rounded from ₹21,380.032)
  ] },
  { id: 'lam', materials: [{ id: 'bopp', quantity: 1280, ratePerUnit: 50 }] }, // ₹64,000
  { id: 'adh', materials: [{ id: 'hotmelt', quantity: 14, ratePerUnit: 420 }] }, // ₹5,880
  { id: 'outer', materials: [{ id: 'carton', quantity: 400, ratePerUnit: null }] }, // NOT PRICED
];

describe('rollUp — line → stage → total', () => {
  const r = rollUp(D6);

  it('sums priced lines into stage subtotals and a total', () => {
    expect(r.stages.find((s) => s.id === 'lam')!.subtotal).toBe(6_400_000);
    expect(r.stages.find((s) => s.id === 'adh')!.subtotal).toBe(588_000);
    const sheet = r.stages.find((s) => s.id === 'sheet')!;
    expect(sheet.subtotal).toBe(19_759_400 + 4_166_400 + 2_138_003);
    expect(r.total).toBe(sheet.subtotal + 6_400_000 + 588_000);
  });

  it('the total is the sum of the subtotals — no line is counted twice or dropped', () => {
    expect(r.total).toBe(r.stages.reduce((sum, s) => sum + s.subtotal, 0));
  });

  it('counts the unpriced line, and calls the total a FLOOR because of it', () => {
    expect(r.unpriced).toBe(1);
    expect(r.priced).toBe(5);
    expect(r.isFloor).toBe(true);
  });

  it('an entirely unpriced stage has subtotal 0 AND unpriced 1 — which is how the screen tells "not priced" from ₹0', () => {
    expect(r.stages.find((s) => s.id === 'outer')).toMatchObject({ subtotal: 0, unpriced: 1 });
    expect(r.stages.find((s) => s.id === 'outer')!.materials[0].paise).toBeNull();
  });

  it('the unpriced item adds NOTHING to the total — it is not counted as free at some default rate', () => {
    const withoutIt = rollUp(D6.filter((s) => s.id !== 'outer'));
    expect(r.total).toBe(withoutIt.total);
  });

  it('with every line priced the total is the figure, not a floor', () => {
    const allPriced = rollUp(D6.map((s) => ({ ...s, materials: s.materials.map((m) => ({ ...m, ratePerUnit: m.ratePerUnit ?? 1 })) })));
    expect(allPriced.isFloor).toBe(false);
    expect(allPriced.unpriced).toBe(0);
  });

  it('an empty BOM is a zero total with nothing unpriced — not a floor of nothing', () => {
    expect(rollUp([])).toEqual({ stages: [], total: 0, unpriced: 0, priced: 0, isFloor: false });
    expect(rollUp([{ id: 's', materials: [] }]).isFloor).toBe(false);
  });

  it('a BOM where NOTHING is priced is a floor of zero — and says so through the count', () => {
    const none = rollUp([{ id: 's', materials: [{ id: 'a', quantity: 1, ratePerUnit: null }, { id: 'b', quantity: 2, ratePerUnit: null }] }]);
    expect(none).toMatchObject({ total: 0, unpriced: 2, priced: 0, isFloor: true });
  });

  it('keeps every material and stage id, in order, so a screen can join cost back onto the tree', () => {
    expect(r.stages.map((s) => s.id)).toEqual(['sheet', 'lam', 'adh', 'outer']);
    expect(r.stages[0].materials.map((m) => m.id)).toEqual(['fbb', 'cmyk', 'spot']);
  });

  it('is exact over many small lines — 1,000 lines of ₹0.10 × 3 total exactly ₹300', () => {
    const many: CostStage[] = [{ id: 's', materials: Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, quantity: 3, ratePerUnit: 0.1 })) }];
    expect(rollUp(many).total).toBe(30_000);
  });
});

describe('formatRupees', () => {
  it.each([
    [33_132_000, '₹3,31,320'],
    [828, '₹8.28'],
    [0, '₹0'],
    [100, '₹1'],
    [150, '₹1.50'],
    [1_00_00_000_00, '₹1,00,00,000'],
  ])('%i paise → %s', (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });

  it('uses Indian digit grouping (lakh/crore), not thousands', () => {
    expect(formatRupees(19_759_400)).toBe('₹1,97,594');
    expect(formatRupees(19_759_400)).not.toBe('₹197,594');
  });

  it('never shows a false ".00" on a round total', () => {
    expect(formatRupees(6_400_000)).not.toContain('.00');
  });
});

describe('withoutRates — the tree without its rates', () => {
  const bom = {
    id: 'b1',
    stages: [{ id: 's1', stageName: 'Print', materials: [{ id: 'm1', description: 'Board', quantity: 2, unit: 'Kg', ratePerUnit: 10 }] }],
  };

  it('removes the key from every material and keeps everything else', () => {
    const out = withoutRates(bom);
    expect('ratePerUnit' in out.stages[0].materials[0]).toBe(false);
    expect(out).toEqual({ id: 'b1', stages: [{ id: 's1', stageName: 'Print', materials: [{ id: 'm1', description: 'Board', quantity: 2, unit: 'Kg' }] }] });
  });

  it('a rate of 0 is removed too — absent, not "0"', () => {
    const out = withoutRates({ stages: [{ materials: [{ ratePerUnit: 0, id: 'x' }] }] });
    expect(JSON.stringify(out)).not.toContain('ratePerUnit');
  });

  it('does not mutate the row it was given', () => {
    withoutRates(bom);
    expect(bom.stages[0].materials[0].ratePerUnit).toBe(10);
  });
});
