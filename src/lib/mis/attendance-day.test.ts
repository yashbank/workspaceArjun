import { describe, expect, it } from 'vitest';

import {
  deriveDays,
  isWithinCorrectionWindow,
  MAX_SHIFT_SPAN_HOURS,
  planDayUpdates,
  workDateFor,
  type PunchFact,
  type ShiftDef,
} from './attendance-day';
import { factoryDateKey, formatFactoryTime } from './factory-time';

// The factory's zone (D22). Every instant below is built from an IST wall-clock reading,
// so these tests read the same on a UTC, an IST or a UTC+8 machine.
const TZ = 'Asia/Kolkata';
const SGT = 'Asia/Singapore'; // UTC+8 — where the database lives
const IST_OFFSET_MS = 330 * 60_000;
const at = (day: number, h: number, m = 0, month = 8) => new Date(Date.UTC(2026, month, day, h, m) - IST_OFFSET_MS);
const S1: ShiftDef = { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00' };
const S2: ShiftDef = { id: 's2', name: 'Shift 2', startTime: '14:00', endTime: '22:00' };
const NIGHT: ShiftDef = { id: 'n', name: 'Night', startTime: '22:00', endTime: '06:00' };
const SHIFTS = [S1, S2, NIGHT];

let n = 0;
const punch = (direction: 'IN' | 'OUT', when: Date, extra: Partial<PunchFact> = {}): PunchFact => ({
  id: `p${++n}`,
  direction,
  punchedAt: when,
  ...extra,
});

const key = (d: Date | null) => (d ? `${factoryDateKey(d, TZ)} ${formatFactoryTime(d, TZ)}` : null);

describe('which day does a punch belong to? (night shift, D20)', () => {
  it('a day-shift punch is that calendar day', () => {
    expect(workDateFor(at(20, 6, 4), SHIFTS, TZ)).toEqual({ workDate: '2026-09-20', shiftId: 's1' });
  });

  it('THE NIGHT SHIFT: a 00:10 clock-in for a 22:00 start is the PREVIOUS day', () => {
    expect(workDateFor(at(21, 0, 10), SHIFTS, TZ)).toEqual({ workDate: '2026-09-20', shiftId: 'n' });
  });

  it('a 22:30 clock-in for the night shift is the same calendar day', () => {
    expect(workDateFor(at(20, 22, 30), SHIFTS, TZ)).toEqual({ workDate: '2026-09-20', shiftId: 'n' });
  });

  it('the device’s stated shift beats the clock: 05:50 for a 06:00 day shift is NOT last night’s', () => {
    // By the clock alone 05:50 sits inside the night window that ends at 06:00.
    expect(workDateFor(at(21, 5, 50), SHIFTS, TZ).workDate).toBe('2026-09-20');
    expect(workDateFor(at(21, 5, 50), SHIFTS, TZ, 's1')).toEqual({ workDate: '2026-09-21', shiftId: 's1' });
  });

  it('ignores a hint that names no real shift, rather than trusting it', () => {
    expect(workDateFor(at(20, 6, 4), SHIFTS, TZ, 'nope')).toEqual({ workDate: '2026-09-20', shiftId: 's1' });
  });

  it('falls back to the calendar day when no shift exists at all', () => {
    expect(workDateFor(at(21, 0, 10), [], TZ)).toEqual({ workDate: '2026-09-21', shiftId: null });
  });

  it('crosses a month boundary correctly', () => {
    expect(workDateFor(at(1, 0, 30, 9), SHIFTS, TZ).workDate).toBe('2026-09-30');
  });
});

describe('deriveDays — one day from its punches', () => {
  it('a plain in and out', () => {
    const days = deriveDays([punch('IN', at(20, 6, 4)), punch('OUT', at(20, 14, 2))], SHIFTS, TZ);
    expect(days.size).toBe(1);
    const d = days.get('2026-09-20')!;
    expect([key(d.clockIn), key(d.clockOut), d.shiftId]).toEqual(['2026-09-20 06:04', '2026-09-20 14:02', 's1']);
  });

  it('is the same day whatever order the punches arrive in — including clock-out FIRST', () => {
    const inn = punch('IN', at(20, 6, 4));
    const out = punch('OUT', at(20, 14, 2));
    const forward = deriveDays([inn, out], SHIFTS, TZ);
    const backward = deriveDays([out, inn], SHIFTS, TZ);
    expect(backward).toEqual(forward);
    expect(backward.size).toBe(1); // not two days
  });

  it('the same punch sent five times derives exactly the days that sending it once does', () => {
    const inn = punch('IN', at(20, 6, 4));
    const out = punch('OUT', at(20, 14, 2));
    expect(deriveDays([inn, inn, inn, inn, inn, out, out, out], SHIFTS, TZ)).toEqual(deriveDays([inn, out], SHIFTS, TZ));
    expect(deriveDays([inn, inn, inn, inn, inn], SHIFTS, TZ).get('2026-09-20')!.punchIds).toEqual([inn.id]);
  });

  it('a second scan while already in is ignored — the first stands (K7)', () => {
    const days = deriveDays([punch('IN', at(20, 6, 4)), punch('IN', at(20, 6, 9)), punch('OUT', at(20, 14, 0))], SHIFTS, TZ);
    expect(key(days.get('2026-09-20')!.clockIn)).toBe('2026-09-20 06:04');
  });

  it('a lunch break is just time between the first in and the last out', () => {
    const days = deriveDays(
      [punch('IN', at(20, 6, 0)), punch('OUT', at(20, 10, 0)), punch('IN', at(20, 10, 30)), punch('OUT', at(20, 14, 0))],
      SHIFTS,
      TZ,
    );
    const d = days.get('2026-09-20')!;
    expect([key(d.clockIn), key(d.clockOut)]).toEqual(['2026-09-20 06:00', '2026-09-20 14:00']);
  });

  it('a clock-in with no clock-out yet is present and not out', () => {
    const d = deriveDays([punch('IN', at(20, 6, 4))], SHIFTS, TZ).get('2026-09-20')!;
    expect(d.clockOut).toBeNull();
  });

  it('a lone clock-out still shows the person as having been there', () => {
    const d = deriveDays([punch('OUT', at(20, 14, 2))], SHIFTS, TZ).get('2026-09-20')!;
    expect([d.clockIn, key(d.clockOut)]).toEqual([null, '2026-09-20 14:02']);
  });

  it('shuffling a whole week of punches never changes the result', () => {
    const week: PunchFact[] = [];
    for (let day = 14; day <= 20; day++) week.push(punch('IN', at(day, 6, 0)), punch('OUT', at(day, 14, 0)));
    const canonical = deriveDays(week, SHIFTS, TZ);
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = [...week].sort((a, b) => ((a.id.charCodeAt(1) * seed) % 7) - ((b.id.charCodeAt(1) * seed) % 7));
      expect(deriveDays(shuffled, SHIFTS, TZ)).toEqual(canonical);
    }
    expect(canonical.size).toBe(7);
  });
});

describe('deriveDays — the night shift crosses midnight (D20)', () => {
  it('one night shift is ONE day, filed under the evening it started', () => {
    const days = deriveDays([punch('IN', at(20, 22, 5)), punch('OUT', at(21, 6, 20))], SHIFTS, TZ);
    expect(days.size).toBe(1);
    const d = days.get('2026-09-20')!;
    expect([key(d.clockIn), key(d.clockOut), d.shiftId]).toEqual(['2026-09-20 22:05', '2026-09-21 06:20', 'n']);
  });

  it('a clock-out at 06:20 — outside every shift window — still pairs with its clock-in, whichever arrives first', () => {
    const inn = punch('IN', at(20, 22, 5));
    const out = punch('OUT', at(21, 6, 20));
    expect(deriveDays([out, inn], SHIFTS, TZ)).toEqual(deriveDays([inn, out], SHIFTS, TZ));
    expect(deriveDays([out, inn], SHIFTS, TZ).size).toBe(1);
  });

  it('a clock-in after midnight for the night shift files under the previous day', () => {
    const d = deriveDays([punch('IN', at(21, 0, 10)), punch('OUT', at(21, 6, 0))], SHIFTS, TZ).get('2026-09-20');
    expect(d).toBeDefined();
  });

  it('two consecutive nights are two days, not one long one', () => {
    const days = deriveDays(
      [punch('IN', at(20, 22, 0)), punch('OUT', at(21, 6, 0)), punch('IN', at(21, 22, 0)), punch('OUT', at(22, 6, 0))],
      SHIFTS,
      TZ,
    );
    expect([...days.keys()].sort()).toEqual(['2026-09-20', '2026-09-21']);
  });
});

describe('forgetting to clock out (MAX_SHIFT_SPAN_HOURS)', () => {
  it(`a gap over ${MAX_SHIFT_SPAN_HOURS} hours starts a new day instead of swallowing today's clock-in`, () => {
    const days = deriveDays([punch('IN', at(19, 6, 0)), punch('IN', at(20, 6, 0)), punch('OUT', at(20, 14, 0))], SHIFTS, TZ);
    expect([...days.keys()].sort()).toEqual(['2026-09-19', '2026-09-20']);
    expect(days.get('2026-09-19')!.clockOut).toBeNull();
    expect(key(days.get('2026-09-20')!.clockOut)).toBe('2026-09-20 14:00');
  });

  it('a clock-out beyond the span is not paired with a clock-in that far back', () => {
    const days = deriveDays([punch('IN', at(19, 6, 0)), punch('OUT', at(20, 14, 0))], SHIFTS, TZ);
    expect(days.get('2026-09-19')!.clockOut).toBeNull();
    expect(days.get('2026-09-20')!.clockIn).toBeNull();
  });
});

describe('planDayUpdates — what to write when one punch arrives', () => {
  it('a new day is an upsert', () => {
    const inn = punch('IN', at(20, 6, 4));
    const plan = planDayUpdates(deriveDays([], SHIFTS, TZ), deriveDays([inn], SHIFTS, TZ));
    expect(plan.upsert.map((d) => d.workDate)).toEqual(['2026-09-20']);
    expect(plan.vacated).toEqual([]);
  });

  it('adding the clock-out to an existing day changes only that day', () => {
    const inn = punch('IN', at(20, 6, 4));
    const out = punch('OUT', at(20, 14, 2));
    const plan = planDayUpdates(deriveDays([inn], SHIFTS, TZ), deriveDays([inn, out], SHIFTS, TZ));
    expect(plan.upsert).toHaveLength(1);
    expect(key(plan.upsert[0].clockOut)).toBe('2026-09-20 14:02');
  });

  it('a duplicate arrival changes nothing — the day is rebuilt ONCE, not five times', () => {
    const inn = punch('IN', at(20, 6, 4));
    const before = deriveDays([inn], SHIFTS, TZ);
    const plan = planDayUpdates(before, deriveDays([inn, inn], SHIFTS, TZ));
    expect(plan).toEqual({ upsert: [], vacated: [] });
  });

  it('THE ORPHAN: a night clock-out filed under the wrong day is VACATED when its clock-in arrives', () => {
    const out = punch('OUT', at(21, 6, 20));
    const inn = punch('IN', at(20, 22, 5));
    const before = deriveDays([out], SHIFTS, TZ); // the lone OUT files itself somewhere
    const after = deriveDays([out, inn], SHIFTS, TZ);
    const plan = planDayUpdates(before, after);

    expect(plan.upsert.map((d) => d.workDate)).toEqual(['2026-09-20']);
    expect(plan.vacated).toEqual([[...before.keys()][0]]);
    expect(plan.vacated).not.toContain('2026-09-20');
  });
});

describe('isWithinCorrectionWindow', () => {
  const today = at(20, 9, 0);

  it('counts today as day one: a three-day window is today and the two before', () => {
    expect(isWithinCorrectionWindow('2026-09-20', today, 3, TZ)).toBe(true);
    expect(isWithinCorrectionWindow('2026-09-19', today, 3, TZ)).toBe(true);
    expect(isWithinCorrectionWindow('2026-09-18', today, 3, TZ)).toBe(true);
    expect(isWithinCorrectionWindow('2026-09-17', today, 3, TZ)).toBe(false);
  });

  it('a one-day window is today only', () => {
    expect(isWithinCorrectionWindow('2026-09-20', today, 1, TZ)).toBe(true);
    expect(isWithinCorrectionWindow('2026-09-19', today, 1, TZ)).toBe(false);
  });

  it('works across a month boundary', () => {
    expect(isWithinCorrectionWindow('2026-09-29', at(1, 8, 0, 9), 3, TZ)).toBe(true);
    expect(isWithinCorrectionWindow('2026-09-28', at(1, 8, 0, 9), 3, TZ)).toBe(false);
  });
});

describe('THE FACTORY ZONE DECIDES THE DAY, NOT THE SERVER (D22)', () => {
  // The database's clock is UTC+8; the plant's is IST. The SAME instants, bucketed by each.

  it('a night-shift clock-out at 05:50 IST belongs to last night in India but to a NEW day on the database’s clock', () => {
    const out = at(21, 5, 50); // 05:50 IST on the 21st = 08:20 in Singapore
    expect(workDateFor(out, SHIFTS, TZ)).toEqual({ workDate: '2026-09-20', shiftId: 'n' });
    // Read on UTC+8 wall-clock it is 08:20 — inside Shift 1, on the 21st. Wrong shift, wrong day.
    expect(workDateFor(out, SHIFTS, SGT)).toEqual({ workDate: '2026-09-21', shiftId: 's1' });
  });

  it('a punch that crosses midnight in one zone but not the other files under a different calendar day', () => {
    const late = at(20, 23, 30); // 23:30 IST on the 20th = 02:00 on the 21st in Singapore
    expect(workDateFor(late, [], TZ).workDate).toBe('2026-09-20');
    expect(workDateFor(late, [], SGT).workDate).toBe('2026-09-21');
  });

  it('a whole night shift derives ONE day in the factory zone', () => {
    const days = deriveDays([punch('IN', at(20, 22, 5)), punch('OUT', at(21, 6, 20))], SHIFTS, TZ);
    expect([...days.keys()]).toEqual(['2026-09-20']);
  });

  it('“today” for the correction window is the factory’s today: 00:30 IST on the 21st is already the 21st, whatever day the server thinks it is', () => {
    const now = at(21, 0, 30); // 19:00Z on the 20th; 03:00 on the 21st in Singapore
    expect(isWithinCorrectionWindow('2026-09-19', now, 3, TZ)).toBe(true);
    // A one-day window on the factory clock is the 21st only.
    expect(isWithinCorrectionWindow('2026-09-20', now, 1, TZ)).toBe(false);
  });
});
