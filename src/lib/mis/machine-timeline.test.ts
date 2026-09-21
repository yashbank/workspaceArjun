/**
 * Phase 24C · D5 — the machine day timeline, as arithmetic.
 *
 * The fixture IS D5's picture (Monday 7 Sept, Shift 1 06:00–15:00, "now" 07:12): the same
 * running, booked and down machines, so "free time is a gap, not a colour" and "free right now"
 * are asserted against the artboard's own answer.
 */
import { describe, expect, it } from 'vitest';

import {
  axisLabel,
  axisMinute,
  buildMachineTimeline,
  hourTicks,
  percentAcross,
  shiftWindow,
  weekStartKey,
  weeklyUtilisation,
  type AllocationInput,
  type MachineInput,
  type ShiftAxis,
} from './machine-timeline';

const IST = 'Asia/Kolkata';
/** An IST wall-clock instant. Day 7 = Monday 7 Sept 2026. */
const ist = (hh: number, mm = 0, day = 7) => new Date(Date.UTC(2026, 8, day, hh, mm) - 5.5 * 3_600_000);
const NOW = ist(7, 12);
const SHIFT_1: ShiftAxis = { startMinute: 360, endMinute: 900, dateKey: '2026-09-07', timeZone: IST };

const machine = (id: string, name: string, isActive = true): MachineInput => ({
  id, name, code: id.toUpperCase(), machineType: null, department: null, isActive,
});
const alloc = (machineId: string, from: [number, number], to: [number, number], order: string, phase: string | null = null, day = 7): AllocationInput => ({
  machineId, startsAt: ist(from[0], from[1], day), endsAt: ist(to[0], to[1], day), orderNumber: order, processName: phase,
});

const MACHINES = [
  machine('heid', 'Heidelberg SM 74'),
  machine('polar', 'Polar 115 Cutter'),
  machine('lam', 'Lamination 1'),
  machine('plat2', 'Auto Platen 2', false),
  machine('glue', 'Folder Gluer 1'),
  machine('uv', 'UV Coater'),
  machine('ruling', 'Ruling Machine 2', false),
  machine('screen', 'Screen Printer'),
  machine('plat1', 'Auto Platen 1'),
];
const ALLOCS = [
  alloc('heid', [6, 0], [13, 0], 'ORD-118', 'Printing'),
  alloc('polar', [10, 0], [13, 0], 'ORD-117'),
  alloc('lam', [6, 0], [11, 30], 'ORD-114', 'Lamination'),
  alloc('lam', [11, 30], [15, 0], 'ORD-118'),
  alloc('glue', [6, 0], [10, 0], 'ORD-109', 'Pasting'),
  alloc('uv', [6, 0], [12, 15], 'ORD-109', 'Coating'),
  alloc('screen', [12, 0], [14, 0], 'ORD-121'),
];
const view = () => buildMachineTimeline(MACHINES, ALLOCS, SHIFT_1, NOW);

describe('the axis', () => {
  it('shiftWindow is the shift in minutes: 06:00–15:00 is 360 → 900, nine hours', () => {
    const w = shiftWindow(SHIFT_1);
    expect(w).toEqual({ from: 360, to: 900 });
    expect((w.to - w.from) / 60).toBe(9);
  });

  it('an overnight shift keeps ONE increasing axis: 22:00–06:00 is 1320 → 1800', () => {
    expect(shiftWindow({ startMinute: 1320, endMinute: 360 })).toEqual({ from: 1320, to: 1800 });
  });

  it('axisMinute reads the FACTORY clock: 06:40 IST is 400 although it is 01:10 UTC (D22)', () => {
    expect(axisMinute(ist(6, 40), '2026-09-07', IST)).toBe(400);
  });

  it('...and the same instant is a different minute in another zone', () => {
    expect(axisMinute(ist(6, 40), '2026-09-07', 'Asia/Singapore')).toBe(400 + 150);
  });

  it('a time after midnight is past 1440 on the shift day\'s axis, so a night shift stays in order', () => {
    expect(axisMinute(ist(1, 30, 8), '2026-09-07', IST)).toBe(1440 + 90);
  });

  it('axisLabel wraps back to a clock time: 1530 → 01:30, 400 → 06:40', () => {
    expect(axisLabel(1530)).toBe('01:30');
    expect(axisLabel(400)).toBe('06:40');
  });

  it('hourTicks gives one tick per whole hour — six through fourteen for D5\'s nine columns', () => {
    const ticks = hourTicks({ from: 360, to: 900 });
    expect(ticks.map((t) => t.label)).toEqual(['06', '07', '08', '09', '10', '11', '12', '13', '14']);
  });

  it('percentAcross puts 06:00 at the left edge, 15:00 at the right, and clamps outside', () => {
    const w = { from: 360, to: 900 };
    expect(percentAcross(360, w)).toBe(0);
    expect(percentAcross(900, w)).toBe(100);
    expect(percentAcross(630, w)).toBe(50);
    expect(percentAcross(100, w)).toBe(0);
    expect(percentAcross(2000, w)).toBe(100);
  });
});

describe('D5\'s picture: running, booked, down — and free as a GAP', () => {
  it('counts 4 running, 3 free, 2 down of 9', () => {
    expect(view().counts).toEqual({ total: 9, running: 4, free: 3, down: 2 });
  });

  it('a row appears only for a machine with a booking or downtime — "8 of 9 shown", Auto Platen 1 is a gap', () => {
    const v = view();
    expect(v.shown).toHaveLength(8);
    expect(v.shown.map((m) => m.id)).not.toContain('plat1');
    expect(v.bars.filter((b) => b.machineId === 'plat1')).toEqual([]);
  });

  it('draws bars ONLY for bookings and downtime — there is no "free" bar kind at all', () => {
    const kinds = new Set(view().bars.map((b) => b.kind));
    expect([...kinds].sort()).toEqual(['BOOKED', 'DOWN', 'RUNNING']);
  });

  it('solid is happening, pale is promised: Heidelberg running, Polar booked, Lamination 1 running THEN booked', () => {
    const bars = view().bars;
    expect(bars.find((b) => b.machineId === 'heid')!.kind).toBe('RUNNING');
    expect(bars.find((b) => b.machineId === 'polar')!.kind).toBe('BOOKED');
    const lam = bars.filter((b) => b.machineId === 'lam');
    expect(lam.map((b) => b.kind)).toEqual(['RUNNING', 'BOOKED']);
  });

  it('a booking that has ended is FINISHED — a third look, neither running nor promised', () => {
    const later = buildMachineTimeline(MACHINES, ALLOCS, SHIFT_1, ist(10, 30));
    expect(later.bars.find((b) => b.machineId === 'glue')!.kind).toBe('FINISHED'); // 06:00–10:00 is over
    expect(later.bars.find((b) => b.machineId === 'polar')!.kind).toBe('RUNNING'); // 10:00–13:00 has begun
  });

  it('a down machine gets ONE full-window DOWN bar, and no booking of its own is drawn behind it', () => {
    const withStale = [...ALLOCS, alloc('plat2', [8, 0], [9, 0], 'ORD-999')];
    const v = buildMachineTimeline(MACHINES, withStale, SHIFT_1, NOW);
    const bars = v.bars.filter((b) => b.machineId === 'plat2');
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ kind: 'DOWN', from: 360, to: 900 });
  });

  it('bars carry their times as labels: the Polar booking reads 10:00 to 13:00', () => {
    const polar = view().bars.find((b) => b.machineId === 'polar')!;
    expect(polar).toMatchObject({ from: 600, to: 780, startLabel: '10:00', endLabel: '13:00', orderNumber: 'ORD-117' });
  });

  it('sorts bars by start so the timeline reads left to right', () => {
    const froms = view().bars.map((b) => b.from);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
  });

  it('"now" sits at 07:12 = minute 432, inside the window', () => {
    expect(view().nowMinute).toBe(432);
  });

  it('outside the shift there is no "now" marker, rather than one pinned to an edge', () => {
    expect(buildMachineTimeline(MACHINES, ALLOCS, SHIFT_1, ist(17, 0)).nowMinute).toBeNull();
    expect(buildMachineTimeline(MACHINES, ALLOCS, SHIFT_1, ist(5, 0)).nowMinute).toBeNull();
  });
});

describe('clipping to the shift window', () => {
  it('a booking that began before the shift is drawn flush to the left edge and says so', () => {
    const v = buildMachineTimeline(MACHINES, [alloc('heid', [4, 0], [9, 0], 'ORD-1')], SHIFT_1, NOW);
    expect(v.bars.find((b) => b.machineId === 'heid')).toMatchObject({ from: 360, to: 540, clippedStart: true, clippedEnd: false, startLabel: '04:00' });
  });

  it('one that runs past the end is clipped to the right edge', () => {
    const v = buildMachineTimeline(MACHINES, [alloc('heid', [14, 0], [18, 0], 'ORD-1')], SHIFT_1, NOW);
    expect(v.bars.find((b) => b.machineId === 'heid')).toMatchObject({ from: 840, to: 900, clippedEnd: true, endLabel: '18:00' });
  });

  it('a booking entirely outside the window draws nothing — and does not make a row appear', () => {
    const v = buildMachineTimeline(MACHINES, [alloc('plat1', [16, 0], [18, 0], 'ORD-1'), alloc('plat1', [1, 0], [5, 0], 'ORD-2')], SHIFT_1, NOW);
    expect(v.bars.filter((b) => b.machineId === 'plat1')).toEqual([]);
    expect(v.shown.map((m) => m.id)).not.toContain('plat1');
  });

  it('a booking that ends exactly as the shift starts does not overlap it', () => {
    const v = buildMachineTimeline(MACHINES, [alloc('plat1', [4, 0], [6, 0], 'ORD-1')], SHIFT_1, NOW);
    expect(v.bars.filter((b) => b.machineId === 'plat1')).toEqual([]);
  });
});

describe('free right now — the panel answers the next question', () => {
  it('lists exactly D5\'s three: Polar free to 10:00, Screen Printer to 12:00, Auto Platen 1 all shift', () => {
    expect(view().freeNow).toEqual([
      { id: 'polar', name: 'Polar 115 Cutter', freeUntil: '10:00' },
      { id: 'screen', name: 'Screen Printer', freeUntil: '12:00' },
      { id: 'plat1', name: 'Auto Platen 1', freeUntil: null },
    ]);
  });

  it('sorts the soonest-to-be-taken first and "free all shift" last', () => {
    const order = view().freeNow.map((f) => f.freeUntil);
    expect(order).toEqual(['10:00', '12:00', null]);
  });

  it('a running machine is not free, and a down machine is never offered', () => {
    const ids = view().freeNow.map((f) => f.id);
    for (const id of ['heid', 'lam', 'glue', 'uv', 'plat2', 'ruling']) expect(ids).not.toContain(id);
  });

  it('a machine whose only booking has finished is free for the rest of the shift', () => {
    const v = buildMachineTimeline(MACHINES, [alloc('glue', [6, 0], [8, 0], 'ORD-109')], SHIFT_1, ist(9, 0));
    expect(v.freeNow.find((f) => f.id === 'glue')).toEqual({ id: 'glue', name: 'Folder Gluer 1', freeUntil: null });
  });

  it('with no machines at all it is empty, not an error', () => {
    const v = buildMachineTimeline([], [], SHIFT_1, NOW);
    expect(v.freeNow).toEqual([]);
    expect(v.counts).toEqual({ total: 0, running: 0, free: 0, down: 0 });
  });
});

describe('weeklyUtilisation — booked hours as a share of the shift', () => {
  it('Monday alone: Heidelberg booked 06:00–13:00 of a 9-hour shift is 78%', () => {
    const u = view().utilisation.find((x) => x.machineId === 'heid')!;
    expect(u.percent).toBe(78);
  });

  it('is against the WHOLE shift, and idle machines are 0%', () => {
    expect(view().utilisation.find((x) => x.machineId === 'plat1')!.percent).toBe(0);
  });

  it('a down machine reports 0 and is flagged down, so the bar says "down" rather than "idle"', () => {
    const u = view().utilisation.find((x) => x.machineId === 'plat2')!;
    expect(u).toMatchObject({ percent: 0, down: true });
  });

  it('spans Monday to the shift day: Heidelberg booked 9h on Mon and 4.5h on Tue is 75% over two shifts', () => {
    const tueShift = { ...SHIFT_1, dateKey: '2026-09-08' };
    const week = [alloc('heid', [6, 0], [15, 0], 'A', null, 7), alloc('heid', [6, 0], [10, 30], 'B', null, 8)];
    const u = weeklyUtilisation(buildMachineTimeline(MACHINES, week, tueShift, ist(9, 0, 8)).machines, week, tueShift);
    expect(u.find((x) => x.machineId === 'heid')!.percent).toBe(75);
  });

  it('an idle day still counts in the denominator — a machine unused on Tuesday shows it', () => {
    const wedShift = { ...SHIFT_1, dateKey: '2026-09-09' };
    const week = [alloc('heid', [6, 0], [15, 0], 'A', null, 7)]; // Monday only, of Mon–Wed
    const rows = MACHINES.map((m) => ({ ...m, status: 'FREE' as const }));
    expect(weeklyUtilisation(rows, week, wedShift).find((x) => x.machineId === 'heid')!.percent).toBe(33);
  });

  it('a booking that spills past the shift end counts only what falls inside it', () => {
    const week = [alloc('heid', [14, 0], [20, 0], 'A')]; // 1h inside the shift, 5h outside
    const rows = MACHINES.map((m) => ({ ...m, status: 'FREE' as const }));
    expect(weeklyUtilisation(rows, week, SHIFT_1).find((x) => x.machineId === 'heid')!.percent).toBe(11);
  });

  it('is capped at 100%, so a double-booking can never draw a bar taller than the axis', () => {
    const week = [alloc('heid', [6, 0], [15, 0], 'A'), alloc('heid', [6, 0], [15, 0], 'B')];
    const rows = MACHINES.map((m) => ({ ...m, status: 'FREE' as const }));
    expect(weeklyUtilisation(rows, week, SHIFT_1).find((x) => x.machineId === 'heid')!.percent).toBe(100);
  });

  it('weekStartKey finds Monday: the 7th is a Monday, the 13th (a Sunday) belongs to the week of the 7th', () => {
    expect(weekStartKey('2026-09-07')).toBe('2026-09-07');
    expect(weekStartKey('2026-09-10')).toBe('2026-09-07');
    expect(weekStartKey('2026-09-13')).toBe('2026-09-07');
    expect(weekStartKey('2026-09-14')).toBe('2026-09-14');
  });

  it('a night shift is measured against its own window each day, not the calendar day', () => {
    const night: ShiftAxis = { startMinute: 1320, endMinute: 360, dateKey: '2026-09-07', timeZone: IST };
    const week = [alloc('heid', [22, 0], [23, 59], 'N')];
    const rows = MACHINES.map((m) => ({ ...m, status: 'FREE' as const }));
    const u = weeklyUtilisation(rows, week, night).find((x) => x.machineId === 'heid')!;
    expect(u.percent).toBe(Math.round((119 / 480) * 100));
  });
});
