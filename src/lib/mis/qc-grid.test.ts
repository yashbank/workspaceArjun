import { describe, expect, it } from 'vitest';

import { buildQcGrid, slotColumns, type GridOrder, type QcCheckInput } from './qc-grid';

const IST = 'Asia/Kolkata';
const DAY = '2026-09-05'; // Saturday
const SHIFT = { startTime: '06:00', endTime: '15:00' };
/** IST hh:mm on the shift day as an instant. */
const ist = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00+05:30`);
const AFTER_SHIFT = ist('16:00');

let n = 0;
const check = (over: Partial<QcCheckInput> & { at: string; day?: string }): QcCheckInput => {
  n += 1;
  const { at, day, ...rest } = over;
  return { id: `c${n}`, orderId: 'o1', bomStageId: null, parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: ist(at, day), ...rest };
};
const ORDERS: GridOrder[] = [
  { id: 'o1', orderNumber: 'ORD-118', description: 'Duplex carton', machines: ['Heidelberg SM 74'] },
  { id: 'o2', orderNumber: 'ORD-117', description: 'Mono carton', machines: [] },
];
const build = (checks: QcCheckInput[], over: Partial<Parameters<typeof buildQcGrid>[0]> = {}) =>
  buildQcGrid({ orders: ORDERS, checks, shift: SHIFT, dateKey: DAY, timeZone: IST, now: AFTER_SHIFT, ...over });

describe('slotColumns — from the shift definition, never a hardcoded list', () => {
  it('a nine-hour shift is nine columns, labelled from its own start', () => {
    const c = slotColumns(SHIFT);
    expect(c).toHaveLength(9);
    expect(c.map((x) => x.label)).toEqual(['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']);
    expect(c[8]).toMatchObject({ from: 840, to: 900 });
  });

  it('changing the shift changes the grid: 08:00–14:00 is six columns', () => {
    expect(slotColumns({ startTime: '08:00', endTime: '14:00' })).toHaveLength(6);
  });

  it('a night shift wraps midnight on one increasing axis, labels wrapping back to 00', () => {
    const c = slotColumns({ startTime: '22:00', endTime: '06:00' });
    expect(c.map((x) => x.label)).toEqual(['22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00']);
    expect(c[2].from).toBe(1440);
  });

  it('a shift that does not start on the hour keeps its own edges', () => {
    const c = slotColumns({ startTime: '06:30', endTime: '15:00' });
    expect(c).toHaveLength(9);
    expect(c[0].label).toBe('06:30');
    expect(c[8]).toMatchObject({ from: 870, to: 900 }); // the last slot is the half-hour that remains
  });
});

describe('the five states', () => {
  it('pass, fail and make-ready are recorded; a slot with nothing recorded and already over is NEVER', () => {
    const g = build([
      check({ at: '06:20' }),
      check({ at: '07:20', result: 'FAIL', defectType: 'Shade' }),
      check({ at: '08:20', result: 'NA' }),
    ]);
    const cells = g.rows[1].cells.map((c) => c.state); // ORD-118 sorts after ORD-117
    expect(cells.slice(0, 4)).toEqual(['pass', 'fail', 'makeready', 'never']);
  });

  it('NEVER is dashed-in-spirit: it is not "make-ready" and not "pass"', () => {
    const g = build([]);
    for (const row of g.rows) for (const cell of row.cells) expect(cell.state).toBe('never');
    expect(g.totals.never).toBe(18);
    expect(g.totals.makeready).toBe(0);
    expect(g.totals.pass).toBe(0);
  });

  it('while the shift is running, a slot that has not ended is UPCOMING — not yet missed', () => {
    const g = build([check({ at: '06:20' })], { now: ist('08:30') });
    const cells = g.rows[1].cells.map((c) => c.state);
    expect(cells).toEqual(['pass', 'never', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    // 07:00–08:00 has ended with nothing recorded; 08:00–09:00 is still running.
  });

  it('before the shift starts, every slot is upcoming', () => {
    const g = build([], { now: ist('05:00') });
    expect(g.totals).toMatchObject({ never: 0, upcoming: 18 });
  });

  it('one failed check makes the hour red even beside a pass; a pass beats make-ready', () => {
    const g = build([check({ at: '09:10' }), check({ at: '09:40', result: 'FAIL' }), check({ at: '10:10', result: 'NA' }), check({ at: '10:40' })]);
    const cells = g.rows[1].cells;
    expect(cells[3]).toEqual({ state: 'fail', checks: 2 });
    expect(cells[4]).toEqual({ state: 'pass', checks: 2 });
  });

  it('the slot edges are exact: 06:59 is the first slot, 07:00 the second', () => {
    const g = build([check({ at: '06:59' }), check({ at: '07:00', orderId: 'o2' })]);
    expect(g.rows[1].cells[0].state).toBe('pass');
    expect(g.rows[1].cells[1].state).toBe('never');
    expect(g.rows[0].cells[1].state).toBe('pass');
  });

  it('a check outside the shift window is not in the grid, and a check after 15:00 does not fill a slot', () => {
    const g = build([check({ at: '05:59' }), check({ at: '15:00' }), check({ at: '20:00' })]);
    expect(g.totals.taken).toBe(0);
  });
});

describe('the factory clock (D22)', () => {
  it('01:00 IST on the shift day is 19:30 UTC the day before — it is before the 06:00 shift, not in it', () => {
    const g = build([check({ at: '01:00' })]);
    expect(g.totals.taken).toBe(0);
  });

  it('a night shift puts a 01:30 check in the 01:00 column of the shift that STARTED the previous evening', () => {
    const g = build([check({ at: '01:30', day: '2026-09-06' })], { shift: { startTime: '22:00', endTime: '06:00' }, now: ist('07:00', '2026-09-06') });
    const cells = g.rows[1].cells.map((c) => c.state);
    expect(cells[3]).toBe('pass'); // the 01:00 column
    expect(cells[0]).toBe('never');
  });

  it('a different zone moves the same instant to a different slot', () => {
    const at = new Date('2026-09-05T02:30:00Z'); // 08:00 IST, 02:30 UTC
    expect(build([{ ...check({ at: '00:00' }), checkTime: at }]).rows[1].cells[2].state).toBe('pass');
    const utc = buildQcGrid({ orders: ORDERS, checks: [{ ...check({ at: '00:00' }), checkTime: at }], shift: SHIFT, dateKey: DAY, timeZone: 'UTC', now: new Date('2026-09-05T20:00:00Z') });
    expect(utc.totals.taken).toBe(0); // 02:30 UTC is before a 06:00 UTC shift
  });
});

describe('a check is only due while the line is running', () => {
  const axis = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
  const late: GridOrder = { id: 'o1', orderNumber: 'ORD-118', description: null, machines: ['Heidelberg SM 74'], runs: [{ from: axis('14:00'), to: axis('18:00') }] };

  it('a line booked from 14:00 has its earlier hours NOT RUNNING — not seven missed checks', () => {
    const g = build([check({ at: '14:20' })], { orders: [late] });
    expect(g.rows[0].cells.map((c) => c.state)).toEqual(['off', 'off', 'off', 'off', 'off', 'off', 'off', 'off', 'pass']);
    expect(g.totals).toMatchObject({ never: 0, off: 8, pass: 1 });
    expect(g.missed).toEqual([]);
  });

  it('inside its booking an unchecked closed hour is still NEVER — the gap that matters is not hidden', () => {
    const g = build([], { orders: [{ ...late, runs: [{ from: axis('08:00'), to: axis('11:00') }] }] });
    expect(g.rows[0].cells.map((c) => c.state)).toEqual(['off', 'off', 'never', 'never', 'never', 'off', 'off', 'off', 'off']);
    expect(g.missed.map((m) => m.slotLabel)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('a booking that ends mid-hour keeps that whole hour due; one that starts mid-hour too', () => {
    const g = build([], { orders: [{ ...late, runs: [{ from: axis('08:30'), to: axis('09:30') }] }] });
    expect(g.rows[0].cells.map((c) => c.state).slice(0, 5)).toEqual(['off', 'off', 'never', 'never', 'off']);
  });

  it('several bookings union: a line that ran, stopped and ran again', () => {
    const g = build([], { orders: [{ ...late, runs: [{ from: axis('06:00'), to: axis('07:00') }, { from: axis('13:00'), to: axis('15:00') }] }] });
    expect(g.rows[0].cells.map((c) => c.state)).toEqual(['never', 'off', 'off', 'off', 'off', 'off', 'off', 'never', 'never']);
  });

  it('no booking at all = unknown run window: every hour is due (and nothing is quietly excluded)', () => {
    const g = build([], { orders: [{ ...late, runs: undefined }] });
    expect(g.totals).toMatchObject({ never: 9, off: 0 });
  });

  it('booked ONLY elsewhere (an empty list) means nothing is due this shift — not nine missed checks', () => {
    const g = build([], { orders: [{ ...late, runs: [] }] });
    expect(g.totals).toMatchObject({ never: 0, off: 9 });
    expect(g.missed).toEqual([]);
  });

  it('a check recorded in a NOT-running hour is still shown — a recorded fact beats the booking', () => {
    const g = build([check({ at: '06:20' })], { orders: [late] });
    expect(g.rows[0].cells[0].state).toBe('pass');
  });

  it('the identity includes not-running hours', () => {
    const g = build([check({ at: '14:20' })], { orders: [late, ORDERS[1]] });
    expect(g.totals.off + g.totals.never + g.totals.pass + g.totals.fail + g.totals.makeready + g.totals.upcoming).toBe(g.totals.slots);
    expect(g.identityHolds).toBe(true);
  });
});

describe('the footer is the sum of the cells', () => {
  it('the artboard\'s arithmetic: 54 slots = 6 lines × 9 hours = 50 passed + 2 failed + 2 not taken', () => {
    const orders: GridOrder[] = Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, orderNumber: `ORD-${100 + i}`, description: null, machines: [] }));
    const checks: QcCheckInput[] = [];
    orders.forEach((o, li) => {
      for (let h = 0; h < 9; h += 1) {
        const skipped = (li === 2 && h === 2) || (li === 5 && h === 8);
        if (skipped) continue;
        const failed = (li === 0 && h === 3) || (li === 4 && h === 5);
        checks.push(check({ at: `${String(6 + h).padStart(2, '0')}:15`, orderId: o.id, result: failed ? 'FAIL' : 'PASS' }));
      }
    });
    const g = build(checks, { orders });
    expect(g.totals).toMatchObject({ lines: 6, columns: 9, slots: 54, pass: 50, fail: 2, never: 2, taken: 52 });
    expect(g.identityHolds).toBe(true);
    expect(g.rows.map((r) => r.taken)).toEqual([9, 9, 8, 9, 9, 8]);
    expect(g.rows.map((r) => r.failed)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it('the identity holds however the shift is filled — a property check', () => {
    const results = ['PASS', 'FAIL', 'NA', 'PASS'];
    for (let seed = 1; seed <= 30; seed += 1) {
      const checks: QcCheckInput[] = [];
      for (let h = 0; h < 12; h += 1) {
        const roll = (seed * 17 + h * 5) % 7;
        if (roll < 5) checks.push(check({ at: `${String(5 + h).padStart(2, '0')}:${String((seed * 7) % 60).padStart(2, '0')}`, orderId: roll % 2 ? 'o1' : 'o2', result: results[roll % 4] }));
      }
      const g = build(checks, { now: ist(`${String(6 + (seed % 10)).padStart(2, '0')}:00`) });
      expect(g.identityHolds).toBe(true);
      expect(g.totals.pass + g.totals.fail + g.totals.makeready + g.totals.never + g.totals.upcoming).toBe(g.totals.slots);
    }
  });

  it('no running lines is an empty grid, not a crash', () => {
    const g = build([], { orders: [] });
    expect(g.rows).toEqual([]);
    expect(g.totals).toMatchObject({ lines: 0, slots: 0 });
    expect(g.identityHolds).toBe(true);
  });
});

describe('a failure carries its clearance', () => {
  const failAt = (at: string, over: Partial<QcCheckInput> = {}) => check({ at, result: 'FAIL', defectType: 'Shade', notes: 'Brand spot off', ...over });

  it('is open until a LATER pass on the same order, stage and parameter', () => {
    const f = failAt('09:05');
    expect(build([f]).failures[0]).toMatchObject({ orderNumber: 'ORD-118', parameter: 'Shade', slotLabel: '09:00', timeLabel: '09:05', defectType: 'Shade', notes: 'Brand spot off', cleared: null, machines: ['Heidelberg SM 74'] });
    expect(build([f, check({ at: '09:40' })]).failures[0].cleared).toBe('09:40');
  });

  it('a pass on a DIFFERENT parameter, stage, or order does not clear it; an earlier pass does not either', () => {
    const f = failAt('09:05');
    expect(build([f, check({ at: '09:40', parameterName: 'Registration' })]).failures[0].cleared).toBeNull();
    expect(build([f, check({ at: '09:40', bomStageId: 'stage-2' })]).failures[0].cleared).toBeNull();
    expect(build([f, check({ at: '09:40', orderId: 'o2' })]).failures[0].cleared).toBeNull();
    expect(build([check({ at: '08:40' }), f]).failures[0].cleared).toBeNull();
  });

  it('a failed re-check is not a clearance; the FIRST later pass is the one named', () => {
    const f = failAt('09:05');
    const g = build([f, failAt('09:30'), check({ at: '10:10' }), check({ at: '11:10' })]);
    expect(g.failures.map((x) => x.cleared)).toEqual(['10:10', '10:10']);
  });

  it('a clearance on a later day says which day', () => {
    const f = failAt('14:05');
    const g = build([f, check({ at: '07:30', day: '2026-09-06' })]);
    expect(g.failures[0].cleared).toBe('06/09 07:30');
  });

  it('a check with no parameter counts as "General" on both sides', () => {
    const f = failAt('09:05', { parameterName: null });
    expect(build([f, check({ at: '09:40', parameterName: null })]).failures[0].cleared).toBe('09:40');
  });

  it('acknowledged is not cleared: nothing but a later pass changes it', () => {
    const f = failAt('09:05');
    expect(build([{ ...f, notes: 'acknowledged by in-charge' }]).failures[0].cleared).toBeNull();
  });

  it('failures are in time order', () => {
    const g = build([failAt('11:05'), failAt('09:05', { orderId: 'o2' })]);
    expect(g.failures.map((x) => x.timeLabel)).toEqual(['09:05', '11:05']);
  });
});

describe('the missed list', () => {
  it('names each never-taken slot with its line and slot, for a closed shift', () => {
    const g = build([check({ at: '06:10' })]);
    expect(g.missed).toHaveLength(17);
    expect(g.missed[0]).toEqual({ orderId: 'o2', orderNumber: 'ORD-117', machines: [], slotLabel: '06:00' });
  });

  it('upcoming slots are not "missed"', () => {
    const g = build([], { now: ist('06:30') });
    expect(g.missed).toEqual([]);
  });
});
