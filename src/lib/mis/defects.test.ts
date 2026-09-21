import { describe, expect, it } from 'vitest';

import {
  MULTI_MACHINE,
  NO_MACHINE,
  UNCLASSIFIED,
  attributeMachine,
  buildDefectReport,
  resolveReason,
  shiftOf,
  type Booking,
  type DefectCheck,
  type DefectMaster,
} from './defects';

const IST = 'Asia/Kolkata';
const MASTERS: DefectMaster[] = [
  { id: 'd1', code: 'MISREG', name: 'Mis-registration', severity: 'MAJOR' },
  { id: 'd2', code: 'CREASE', name: 'Creasing at fold', severity: 'MINOR' },
  { id: 'd3', code: 'GLUE', name: 'Glue line failure', severity: 'CRITICAL' },
];
const SHIFTS = [{ name: 'Shift 1', startTime: '06:00', endTime: '15:00' }, { name: 'Shift 2', startTime: '15:00', endTime: '00:00' }];
const at = (iso: string) => new Date(`${iso}+05:30`);

let n = 0;
const chk = (when: string, over: Partial<DefectCheck> = {}): DefectCheck => {
  n += 1;
  return { id: `c${n}`, orderId: 'o1', orderNumber: 'ORD-118', checkTime: at(when), defectType: 'Mis-registration', defectQty: 100, notes: null, parameterName: 'Registration', checkerName: 'S. Kulkarni', ...over };
};
const booking = (orderId: string, machine: string, from: string, to: string): Booking => ({ orderId, machine, from: at(from), to: at(to) });
const B = [booking('o1', 'Heidelberg SM 74', '2026-08-01T00:00:00', '2026-08-31T23:59:00')];
const build = (checks: DefectCheck[], over: Partial<Parameters<typeof buildDefectReport>[0]> = {}) =>
  buildDefectReport({ checks, masters: MASTERS, bookings: B, shifts: SHIFTS, timeZone: IST, monthKey: '2026-08', ...over });

describe('resolveReason — severity comes from the master, never the person', () => {
  it('matches a master by name or code, ignoring case and spacing, and takes its severity', () => {
    expect(resolveReason('Mis-registration', MASTERS)).toEqual({ key: 'm:d1', label: 'Mis-registration', severity: 'MAJOR' });
    expect(resolveReason('  mis-REGISTRATION ', MASTERS).key).toBe('m:d1');
    expect(resolveReason('creasing   at fold', MASTERS)).toMatchObject({ key: 'm:d2', severity: 'MINOR' });
    expect(resolveReason('glue line', MASTERS).key).toBe('t:glue line'); // a part of a name is not the name
    expect(resolveReason('glue', MASTERS)).toMatchObject({ key: 'm:d3', label: 'Glue line failure', severity: 'CRITICAL' }); // …but it IS the code GLUE
  });

  it('text that matches no master is NOT classified — it keeps what was typed and gets no severity', () => {
    expect(resolveReason('Ink smudge', MASTERS)).toEqual({ key: 't:ink smudge', label: 'Ink smudge', severity: null });
    expect(resolveReason('Ink  Smudge', MASTERS).key).toBe('t:ink smudge'); // spacing/case variants are one reason
  });

  it('nothing typed is "unstated", not a guess', () => {
    for (const blank of [null, '', '   ']) expect(resolveReason(blank, MASTERS)).toEqual({ key: '__unstated', label: null, severity: null });
  });
});

describe('attributeMachine — derived from the booking that covered the moment', () => {
  it('one covering booking is that machine', () => {
    expect(attributeMachine(chk('2026-08-10T09:00:00'), B)).toBe('Heidelberg SM 74');
  });

  it('two machines at once is "several", never a pick', () => {
    const two = [...B, booking('o1', 'Polar Cutter', '2026-08-10T08:00:00', '2026-08-10T12:00:00')];
    expect(attributeMachine(chk('2026-08-10T09:00:00'), two)).toBe(MULTI_MACHINE);
  });

  it('no booking at that moment is "no booking" — not the order\'s other machine', () => {
    expect(attributeMachine(chk('2026-09-02T09:00:00'), B)).toBe(NO_MACHINE);
    expect(attributeMachine(chk('2026-08-10T09:00:00', { orderId: 'other' }), B)).toBe(NO_MACHINE);
  });

  it('the booking end is exclusive, the start inclusive', () => {
    const b = [booking('o1', 'M', '2026-08-10T08:00:00', '2026-08-10T10:00:00')];
    expect(attributeMachine(chk('2026-08-10T08:00:00'), b)).toBe('M');
    expect(attributeMachine(chk('2026-08-10T10:00:00'), b)).toBe(NO_MACHINE);
  });
});

describe('shiftOf — on the factory clock', () => {
  it('finds the shift by the factory minute, including a shift that ends at midnight', () => {
    expect(shiftOf(at('2026-08-10T06:00:00'), SHIFTS, IST)).toBe('Shift 1');
    expect(shiftOf(at('2026-08-10T14:59:00'), SHIFTS, IST)).toBe('Shift 1');
    expect(shiftOf(at('2026-08-10T15:00:00'), SHIFTS, IST)).toBe('Shift 2');
    expect(shiftOf(at('2026-08-10T23:30:00'), SHIFTS, IST)).toBe('Shift 2');
  });

  it('outside every shift is null, not the nearest', () => {
    expect(shiftOf(at('2026-08-10T03:00:00'), SHIFTS, IST)).toBeNull();
  });

  it('the zone matters: 09:30 UTC is 15:00 IST — Shift 2 — but 09:30 on a UTC clock', () => {
    const t = new Date('2026-08-10T09:30:00Z');
    expect(shiftOf(t, SHIFTS, IST)).toBe('Shift 2');
    expect(shiftOf(t, SHIFTS, 'UTC')).toBe('Shift 1');
  });
});

describe('the month is the factory\'s (D22)', () => {
  it('01:30 IST on 1 Sep is 31 Aug in UTC — it belongs to September', () => {
    const c = chk('2026-09-01T01:30:00');
    expect(build([c], { monthKey: '2026-09' }).entries).toBe(1);
    expect(build([c], { monthKey: '2026-08' }).entries).toBe(0);
  });

  it('23:30 IST on 31 Aug is still August', () => {
    expect(build([chk('2026-08-31T23:30:00')]).entries).toBe(1);
  });
});

describe('the Pareto — sorted, and cut at 80%', () => {
  // Artboard shape: 8 reasons; the first five carry 85.7%.
  const spec: [string, number][] = [['Mis-registration', 1142], ['Shade variation', 786], ['Creasing at fold', 604], ['Ink set-off', 441], ['Die-cut misalignment', 338], ['Glue line failure', 279], ['Board delamination', 158], ['Other', 116]];
  const checks = spec.map(([defectType, defectQty], i) => chk(`2026-08-${String(i + 1).padStart(2, '0')}T10:00:00`, { defectType, defectQty }));
  const r = build(checks);

  it('sorts by quantity and carries the running share', () => {
    expect(r.reasons.map((x) => x.label)).toEqual(spec.map(([l]) => l));
    expect(r.quantity).toBe(3864);
    expect(r.reasons[0].share).toBeCloseTo(29.56, 1);
    expect(r.reasons[2].cumulative).toBeCloseTo(65.5, 1);
    expect(r.reasons[7].cumulative).toBeCloseTo(100, 6);
  });

  it('marks the row where the cumulative share first reaches 80% — here the fifth, at 85.7%', () => {
    expect(r.cutAfter).toBe(4);
    expect(r.reasons[4].cumulative).toBeCloseTo(85.7, 1);
    expect(r.reasons[3].cumulative).toBeLessThan(80);
  });

  it('a share landing exactly on 80% is the cut', () => {
    const r2 = build([chk('2026-08-02T10:00:00', { defectType: 'A', defectQty: 80 }), chk('2026-08-03T10:00:00', { defectType: 'B', defectQty: 20 })]);
    expect(r2.cutAfter).toBe(0);
  });

  it('the top-three share is the running share at the third row — and only when there ARE more than three', () => {
    expect(r.top3Share).toBeCloseTo(65.5, 1);
    expect(build(checks.slice(0, 3)).top3Share).toBeNull(); // three reasons: 100% is no finding
    expect(build([]).top3Share).toBeNull();
    expect(build(checks.slice(0, 4).map((c) => ({ ...c, defectQty: null }))).top3Share).toBeNull(); // no quantities: no share
  });

  it('a single reason cuts at itself; no reasons has no cut', () => {
    expect(build([chk('2026-08-02T10:00:00')]).cutAfter).toBe(0);
    expect(build([]).cutAfter).toBeNull();
  });

  it('ties break by entries then name, so the order is stable', () => {
    const r3 = build([
      chk('2026-08-02T10:00:00', { defectType: 'Zed', defectQty: 50 }),
      chk('2026-08-03T10:00:00', { defectType: 'Alpha', defectQty: 50 }),
    ]);
    expect(r3.reasons.map((x) => x.label)).toEqual(['Alpha', 'Zed']);
  });

  it('a reason typed three ways is one reason', () => {
    const r4 = build([1, 2, 3].map((d, i) => chk(`2026-08-0${d}T10:00:00`, { defectType: ['Ink smudge', 'ink  SMUDGE', ' Ink smudge '][i], defectQty: 10 })));
    expect(r4.reasons).toHaveLength(1);
    expect(r4.reasons[0]).toMatchObject({ qty: 30, entries: 3 });
  });

  it('shares are of the FILTERED quantity and cumulative reaches 100', () => {
    const r5 = build(checks, { filters: { severity: 'MAJOR' } });
    expect(r5.reasons.at(-1)!.cumulative).toBeCloseTo(100, 6);
    expect(r5.reasons.map((x) => x.label)).toEqual(['Mis-registration']);
  });
});

describe('quantities and severity', () => {
  it('severity is tallied by quantity; unclassified text goes to its own bucket', () => {
    const r = build([
      chk('2026-08-02T10:00:00', { defectType: 'Mis-registration', defectQty: 100 }),
      chk('2026-08-03T10:00:00', { defectType: 'Creasing at fold', defectQty: 40 }),
      chk('2026-08-04T10:00:00', { defectType: 'Glue line failure', defectQty: 10 }),
      chk('2026-08-05T10:00:00', { defectType: 'Ink smudge', defectQty: 7 }),
      chk('2026-08-06T10:00:00', { defectType: null, defectQty: 3 }),
    ]);
    expect(r.severity).toEqual({ CRITICAL: 10, MAJOR: 100, MINOR: 40, [UNCLASSIFIED]: 10 });
    expect(r.quantity).toBe(160);
    expect(r.severityShare).toEqual({ CRITICAL: 6.25, MAJOR: 62.5, MINOR: 25, [UNCLASSIFIED]: 6.25 });
    expect(Object.values(r.severityShare).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(Object.values(build([]).severityShare).every((v) => v === 0)).toBe(true);
  });

  it('a check with no quantity is an entry that adds 0 — and is counted, not hidden', () => {
    const r = build([chk('2026-08-02T10:00:00', { defectQty: null }), chk('2026-08-03T10:00:00', { defectQty: 5 })]);
    expect(r).toMatchObject({ entries: 2, quantity: 5, withoutQuantity: 1 });
  });

  it('nothing in the month is empty, not NaN', () => {
    const r = build([]);
    expect(r).toMatchObject({ entries: 0, quantity: 0, reasons: [], machines: [], drill: null, log: [], logTotal: 0 });
    expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
  });
});

describe('by machine — counted, with the unknowns in their own rows', () => {
  const two = [...B, booking('o2', 'Lamination 1', '2026-08-01T00:00:00', '2026-08-31T23:59:00')];
  const checks = [
    chk('2026-08-02T10:00:00', { defectQty: 300 }),
    chk('2026-08-03T10:00:00', { orderId: 'o2', orderNumber: 'ORD-114', defectQty: 100 }),
    chk('2026-08-04T10:00:00', { orderId: 'o3', orderNumber: 'ORD-200', defectQty: 50 }),
  ];
  const r = build(checks, { bookings: two });

  it('ranks by quantity; an order with no booking is "no booking", not folded into a machine', () => {
    expect(r.machines).toEqual([{ key: 'Heidelberg SM 74', qty: 300, entries: 1 }, { key: 'Lamination 1', qty: 100, entries: 1 }, { key: NO_MACHINE, qty: 50, entries: 1 }]);
  });

  it('the filter offers only real machines, and says whether the unknown buckets exist', () => {
    expect(r.available).toMatchObject({ machines: ['Heidelberg SM 74', 'Lamination 1'], hasNoMachine: true, hasMulti: false });
  });

  it('a machine filter narrows every section; the offered list stays complete', () => {
    const f = build(checks, { bookings: two, filters: { machine: 'Lamination 1' } });
    expect(f).toMatchObject({ entries: 1, quantity: 100 });
    expect(f.available.machines).toEqual(['Heidelberg SM 74', 'Lamination 1']);
  });
});

describe('the drill — reason, then machine, then shift', () => {
  const two = [...B, booking('o2', 'Polar Cutter', '2026-08-01T00:00:00', '2026-08-31T23:59:00')];
  const checks = [
    chk('2026-08-02T16:00:00', { defectQty: 400 }), // Heidelberg, Shift 2
    chk('2026-08-03T16:30:00', { defectQty: 300 }), // Heidelberg, Shift 2
    chk('2026-08-04T09:00:00', { defectQty: 300 }), // Heidelberg, Shift 1
    chk('2026-08-05T09:00:00', { orderId: 'o2', defectQty: 200 }), // Polar, Shift 1
    chk('2026-08-06T09:00:00', { defectType: 'Glue line failure', defectQty: 50 }),
  ];
  const r = build(checks, { bookings: two });

  it('names the biggest reason, the machine holding most of it, and the shift holding most of THAT', () => {
    expect(r.drill!.reason).toMatchObject({ label: 'Mis-registration', qty: 1200 });
    expect(r.drill!.machine).toMatchObject({ name: 'Heidelberg SM 74', qty: 1000 });
    expect(r.drill!.machine!.shareOfReason).toBeCloseTo(83.33, 1);
    expect(r.drill!.shift).toMatchObject({ name: 'Shift 2', qty: 700 });
    expect(r.drill!.shift!.shareOfMachine).toBeCloseTo(70, 5);
  });

  it('shares are of the step before, and each step is a subset', () => {
    expect(r.drill!.machine!.qty).toBeLessThanOrEqual(r.drill!.reason.qty);
    expect(r.drill!.shift!.qty).toBeLessThanOrEqual(r.drill!.machine!.qty);
  });

  it('an unknown machine is never chosen as "the machine"', () => {
    const r2 = build([chk('2026-08-02T10:00:00', { orderId: 'ghost', defectQty: 900 }), chk('2026-08-03T10:00:00', { defectQty: 5 })]);
    expect(r2.drill!.machine).toMatchObject({ name: 'Heidelberg SM 74', qty: 5 });
  });

  it('with no attributable machine the drill stops at the reason, and says so by being null', () => {
    const r3 = build([chk('2026-08-02T10:00:00', { orderId: 'ghost', defectQty: 9 })]);
    expect(r3.drill).toMatchObject({ reason: { qty: 9 }, machine: null, shift: null });
  });

  it('a check outside every shift is left out of the shift step, not assigned to one', () => {
    const r4 = build([chk('2026-08-02T03:00:00', { defectQty: 10 })]);
    expect(r4.drill!.machine).toMatchObject({ qty: 10 });
    expect(r4.drill!.shift).toBeNull();
  });
});

describe('the log', () => {
  it('is most recent first, capped, and says how many there were', () => {
    const checks = Array.from({ length: 30 }, (_, i) => chk(`2026-08-${String((i % 28) + 1).padStart(2, '0')}T10:${String(i).padStart(2, '0')}:00`));
    const r = build(checks);
    expect(r.log).toHaveLength(25);
    expect(r.logTotal).toBe(30);
    const times = r.log.map((l) => `${l.dateKey}T${l.timeLabel}`);
    expect(times).toEqual([...times].sort().reverse());
  });

  it('every row traces to an order and a person; the reason label is the master\'s when there is one', () => {
    const r = build([chk('2026-08-28T09:30:00', { defectType: 'MISREG', notes: 'Brand spot' })]);
    expect(r.log[0]).toMatchObject({ orderNumber: 'ORD-118', dateKey: '2026-08-28', timeLabel: '09:30', machine: 'Heidelberg SM 74', reasonLabel: 'Mis-registration', severity: 'MAJOR', qty: 100, by: 'S. Kulkarni', notes: 'Brand spot' });
  });

  it('an unstated reason and no quantity stay null in the log — not "0" and not a made-up label', () => {
    const r = build([chk('2026-08-28T09:30:00', { defectType: null, defectQty: null, checkerName: null })]);
    expect(r.log[0]).toMatchObject({ reasonLabel: null, severity: null, qty: null, by: null });
  });
});
