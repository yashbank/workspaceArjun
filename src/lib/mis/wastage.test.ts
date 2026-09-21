import { describe, expect, it } from 'vitest';

import { STATE_HUES, SERIES_HUES } from './chart';
import {
  DEFAULT_WEEKS,
  NAMED_SERIES,
  OTHER_HUE,
  OTHER_KEY,
  buildWastage,
  clampWeeks,
  percentOf,
  weekStarts,
  windowKeys,
  type WastageLog,
} from './wastage';

const IST = 'Asia/Kolkata';
// Thursday 10 Sep 2026 — its week starts Monday 07 Sep.
const LAST = '2026-09-10';

let n = 0;
const log = (over: Partial<WastageLog> & { at: string }): WastageLog => {
  n += 1;
  const { at, ...rest } = over;
  return {
    loggedAt: new Date(at), qtyProduced: 1000, qtyWaste: 10, unit: 'KG', machineId: 'm1', machineName: 'Heidelberg',
    orderId: `o${n}`, orderNumber: `ORD-${n}`, description: 'Duplex', phaseName: 'Printing', ...rest,
  };
};
const build = (logs: WastageLog[], o: Partial<Parameters<typeof buildWastage>[1]> = {}) =>
  buildWastage(logs, { timeZone: IST, lastKey: LAST, weeks: 4, ...o });

describe('clampWeeks · percentOf · the window', () => {
  it('a span is one of the offered choices, else the default', () => {
    expect(clampWeeks('4')).toBe(4);
    expect(clampWeeks(26)).toBe(26);
    expect(clampWeeks('7')).toBe(DEFAULT_WEEKS);
    expect(clampWeeks(undefined)).toBe(DEFAULT_WEEKS);
    expect(clampWeeks('abc')).toBe(DEFAULT_WEEKS);
    expect(clampWeeks(['4'])).toBe(DEFAULT_WEEKS);
    expect(clampWeeks(null)).toBe(DEFAULT_WEEKS);
  });

  it('a percentage is null — never 0% — when there is no output to divide by', () => {
    expect(percentOf(5, 0)).toBeNull();
    expect(percentOf(0, 100)).toBe(0);
    expect(percentOf(31, 1000)).toBeCloseTo(3.1);
  });

  it('week starts run oldest → newest and end with the week that holds the last day', () => {
    expect(weekStarts(LAST, 4)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07']);
    expect(windowKeys(LAST, 4)).toEqual({ fromKey: '2026-08-17', toKey: LAST });
  });

  it('a Sunday belongs to the week that is ending, a Monday starts the next', () => {
    expect(weekStarts('2026-09-13', 1)).toEqual(['2026-09-07']);
    expect(weekStarts('2026-09-14', 1)).toEqual(['2026-09-14']);
  });
});

describe('weeks are the FACTORY\'s (D22), never the server clock', () => {
  it('01:30 IST on Monday 7 Sep is 20:00 UTC on Sunday — it belongs to the week starting 7 Sep, not 31 Aug', () => {
    const r = build([log({ at: '2026-09-06T20:00:00Z', qtyWaste: 7 })]);
    expect(r.weeks[3].total).toBe(7);
    expect(r.weeks[2].total).toBe(0);
  });

  it('23:30 IST on Sunday 6 Sep is 18:00 UTC the same day — still the week ending 6 Sep', () => {
    const r = build([log({ at: '2026-09-06T18:00:00Z', qtyWaste: 4 })]);
    expect(r.weeks[2].total).toBe(4);
    expect(r.weeks[3].total).toBe(0);
  });

  it('the caller may over-fetch a day either side: rows outside the window are dropped', () => {
    const r = build([
      log({ at: '2026-08-16T20:00:00Z', qtyWaste: 99 }), // 17 Aug 01:30 IST — the first day IN
      log({ at: '2026-08-16T17:00:00Z', qtyWaste: 55 }), // 16 Aug 22:30 IST — the day before: OUT
      log({ at: '2026-09-10T20:00:00Z', qtyWaste: 33 }), // 11 Sep 01:30 IST — the day after: OUT
    ]);
    expect(r.totals.waste).toBe(99);
    expect(r.totals.entries).toBe(1);
  });

  it('a different factory zone moves the same instant to a different week', () => {
    const at = '2026-09-06T20:00:00Z';
    expect(build([log({ at })], { timeZone: 'UTC' }).weeks[2].total).toBe(10);
    expect(build([log({ at })], { timeZone: IST }).weeks[3].total).toBe(10);
  });
});

describe('one unit — never Kg plus Nos', () => {
  const mixed = () => [
    log({ at: '2026-09-08T06:00:00Z', unit: 'KG', qtyWaste: 30, qtyProduced: 1000 }),
    log({ at: '2026-09-08T06:00:00Z', unit: 'KG', qtyWaste: 20, qtyProduced: 1000 }),
    log({ at: '2026-09-08T06:00:00Z', unit: 'NOS', qtyWaste: 400, qtyProduced: 50000 }),
  ];

  it('defaults to the unit with the most waste and reports every unit seen', () => {
    const r = build(mixed());
    expect(r.unit).toBe('NOS');
    expect(r.units).toEqual([{ unit: 'NOS', waste: 400 }, { unit: 'KG', waste: 50 }]);
  });

  it('a chosen unit filters EVERY figure, and nothing is added across units', () => {
    const r = build(mixed(), { unit: 'kg' }); // case-insensitive
    expect(r.unit).toBe('KG');
    expect(r.totals).toMatchObject({ waste: 50, produced: 2000, entries: 2 });
    expect(r.weeks.reduce((s, w) => s + w.total, 0)).toBe(50);
    expect(r.topOrders.every((o) => o.waste <= 30)).toBe(true);
  });

  it('an unknown unit falls back to the default rather than showing an empty screen', () => {
    expect(build(mixed(), { unit: 'LTR' }).unit).toBe('NOS');
  });
});

describe('the percentage names its denominator', () => {
  it('total percent is waste ÷ output over the same rows', () => {
    const r = build([log({ at: '2026-09-08T06:00:00Z', qtyWaste: 31, qtyProduced: 1000 })]);
    expect(r.totals.percent).toBeCloseTo(3.1);
    expect(r.totals.produced).toBe(1000);
  });

  it('rows with waste but no output report null, not a division by zero or 0%', () => {
    const r = build([log({ at: '2026-09-08T06:00:00Z', qtyWaste: 12, qtyProduced: 0 })]);
    expect(r.totals.percent).toBeNull();
    expect(r.topOrders[0].percent).toBeNull();
    expect(r.byMachine[0].percent).toBeNull();
  });
});

describe('phase series — fixed hues, four named at most, never cycled', () => {
  const phases = ['Printing', 'Die cutting', 'Lamination', 'Pasting', 'Folding', 'Packing'];
  // Printing wastes most, Packing least.
  const many = () => phases.map((p, i) => log({ at: '2026-09-08T06:00:00Z', phaseName: p, qtyWaste: 60 - i * 10, machineId: `m${i}`, machineName: `M${i}` }));

  it('ranks by waste and gives the top four the palette in order', () => {
    const r = build(many());
    expect(r.series.slice(0, 4).map((s) => s.name)).toEqual(['Printing', 'Die cutting', 'Lamination', 'Pasting']);
    expect(r.series.slice(0, 4).map((s) => s.hue)).toEqual(SERIES_HUES.slice(0, 4));
    expect(NAMED_SERIES).toBe(4);
  });

  it('folds the rest into ONE neutral "other" series — the fifth palette hue is never reused', () => {
    const r = build(many());
    expect(r.series).toHaveLength(5);
    const other = r.series[4];
    expect(other).toMatchObject({ key: OTHER_KEY, name: null, hue: OTHER_HUE });
    expect(new Set(r.series.map((s) => s.hue)).size).toBe(5); // no colour appears twice
    expect(r.weeks[3].byKey[OTHER_KEY]).toBe(20 + 10); // Folding 20 + Packing 10
  });

  it('a series is never a state colour (green / amber / red are reserved)', () => {
    const r = build(many());
    for (const s of r.series) expect(Object.values(STATE_HUES)).not.toContain(s.hue);
  });

  it('a row with no phase goes to "other", and other exists only when something is in it', () => {
    const r = build([log({ at: '2026-09-08T06:00:00Z', phaseName: null, qtyWaste: 5 })]);
    expect(r.series).toEqual([{ key: OTHER_KEY, name: null, hue: OTHER_HUE }]);
    const clean = build([log({ at: '2026-09-08T06:00:00Z', phaseName: 'Printing' })]);
    expect(clean.series.map((s) => s.key)).toEqual(['Printing']);
  });

  it('filtering to one machine does NOT repaint a phase: hues follow the whole window', () => {
    const all = build(many());
    const one = build(many(), { machineId: 'm3' }); // Pasting only
    const hueOf = (r: ReturnType<typeof build>, name: string) => r.series.find((s) => s.name === name)?.hue;
    expect(hueOf(one, 'Pasting')).toBe(hueOf(all, 'Pasting'));
    expect(hueOf(one, 'Printing')).toBe(hueOf(all, 'Printing'));
  });

  it('every week\'s stacked segments add up to that week\'s total', () => {
    const r = build(many());
    for (const w of r.weeks) expect(Object.values(w.byKey).reduce((s, v) => s + v, 0)).toBe(w.total);
  });
});

describe('machines and orders', () => {
  const base = () => [
    log({ at: '2026-09-08T06:00:00Z', machineId: 'a', machineName: 'Alpha', qtyWaste: 40, qtyProduced: 1000, orderId: 'o1', orderNumber: 'ORD-1' }),
    log({ at: '2026-09-08T06:00:00Z', machineId: 'b', machineName: 'Beta', qtyWaste: 90, qtyProduced: 1500, orderId: 'o2', orderNumber: 'ORD-2' }),
    log({ at: '2026-09-08T06:00:00Z', machineId: 'b', machineName: 'Beta', qtyWaste: 10, qtyProduced: 500, orderId: 'o1', orderNumber: 'ORD-1' }),
  ];

  it('by-machine is largest waste first and ignores the machine filter — it is the comparison', () => {
    const r = build(base(), { machineId: 'a' });
    expect(r.byMachine.map((m) => [m.name, m.waste])).toEqual([['Beta', 100], ['Alpha', 40]]);
    expect(r.byMachine[0].percent).toBeCloseTo(5);
    expect(r.machineId).toBe('a');
    expect(r.machines.map((m) => m.name)).toEqual(['Alpha', 'Beta']);
  });

  it('the machine filter scopes the totals, weeks and orders', () => {
    const r = build(base(), { machineId: 'a' });
    expect(r.totals).toMatchObject({ waste: 40, produced: 1000, orders: 1, entries: 1 });
    expect(r.topOrders.map((o) => o.orderNumber)).toEqual(['ORD-1']);
  });

  it('a machine that is not in the window is ignored, not an empty screen', () => {
    const r = build(base(), { machineId: 'zzz' });
    expect(r.machineId).toBeNull();
    expect(r.totals.waste).toBe(140);
  });

  it('top orders sum an order across machines, sort by waste, and skip an order with none', () => {
    const r = build([...base(), log({ at: '2026-09-08T06:00:00Z', orderId: 'o9', orderNumber: 'ORD-9', qtyWaste: 0 })]);
    expect(r.topOrders.map((o) => [o.orderNumber, o.waste])).toEqual([['ORD-2', 90], ['ORD-1', 50]]);
    expect(r.topOrders[0].percent).toBeCloseTo(6);
  });

  it('only five orders are listed, but the total counts them all', () => {
    const logs = Array.from({ length: 8 }, (_, i) => log({ at: '2026-09-08T06:00:00Z', orderId: `x${i}`, orderNumber: `X-${i}`, qtyWaste: i + 1 }));
    const r = build(logs);
    expect(r.topOrders).toHaveLength(5);
    expect(r.topOrders[0].waste).toBe(8);
    expect(r.totals.orders).toBe(8);
  });

  it('a log with no machine is in the totals but on no machine bar', () => {
    const r = build([log({ at: '2026-09-08T06:00:00Z', machineId: null, machineName: null, qtyWaste: 9 })]);
    expect(r.totals.waste).toBe(9);
    expect(r.byMachine).toEqual([]);
  });
});

describe('an empty window is empty, not zero', () => {
  it('no logs → no unit, no series, every week present at 0', () => {
    const r = build([]);
    expect(r.unit).toBeNull();
    expect(r.units).toEqual([]);
    expect(r.series).toEqual([]);
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks.every((w) => w.total === 0)).toBe(true);
    expect(r.totals).toMatchObject({ waste: 0, produced: 0, percent: null, orders: 0, entries: 0 });
  });
});
