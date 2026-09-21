import { describe, expect, it } from 'vitest';

import {
  buildMonthMatrix,
  cellState,
  dayDetail,
  daysOfMonth,
  dbDateKey,
  durationLabel,
  hoursLabel,
  parseMonthKey,
  resolveMonth,
  shiftMonth,
  type MatrixEmployee,
  type MatrixRecord,
} from './attendance-month';

describe('months', () => {
  it('parses only a real month key', () => {
    expect(parseMonthKey('2026-08')).toBe('2026-08');
    for (const bad of ['2026-13', '2026-00', '2026-8', '26-08', '2026-08-01', '', null, undefined, ['2026-08'], 202608]) expect(parseMonthKey(bad)).toBeNull();
  });

  it('steps across a year boundary in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-08', -13)).toBe('2025-07');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });

  it('defaults to the LAST FINISHED month, never the running one', () => {
    expect(resolveMonth(undefined, '2026-09-21')).toEqual({ key: '2026-08', running: false });
    expect(resolveMonth('garbage', '2026-01-05')).toEqual({ key: '2025-12', running: false });
  });

  it('the running month is reachable only by asking, and is flagged; a future month is clamped to it', () => {
    expect(resolveMonth('2026-09', '2026-09-21')).toEqual({ key: '2026-09', running: true });
    expect(resolveMonth('2027-03', '2026-09-21')).toEqual({ key: '2026-09', running: true });
    expect(resolveMonth('2026-05', '2026-09-21')).toEqual({ key: '2026-05', running: false });
  });

  it('lists every calendar day, with the right weekday — August 2026 starts on a Saturday', () => {
    const d = daysOfMonth('2026-08');
    expect(d).toHaveLength(31);
    expect(d[0]).toEqual({ key: '2026-08-01', day: 1, weekday: 'S' });
    expect(d[1].weekday).toBe('S'); // Sunday 2 Aug
    expect(d[2].weekday).toBe('M');
    expect(d[30].key).toBe('2026-08-31');
  });

  it('knows the length of a short month and of a leap February', () => {
    expect(daysOfMonth('2026-02')).toHaveLength(28);
    expect(daysOfMonth('2028-02')).toHaveLength(29);
    expect(daysOfMonth('2026-04')).toHaveLength(30);
  });

  it('a @db.Date value keys by its UTC date — never the server-local one', () => {
    expect(dbDateKey(new Date('2026-08-05T00:00:00Z'))).toBe('2026-08-05');
    expect(dbDateKey(new Date('2026-08-05T23:59:59Z'))).toBe('2026-08-05');
  });
});

describe('cellState — one worker-day', () => {
  it('a present day with overtime is still ONE present day (a stripe, not a second cell)', () => {
    expect(cellState({ status: 'PRESENT', otMinutes: 0 }, false)).toBe('PRESENT');
    expect(cellState({ status: 'PRESENT', otMinutes: 45 }, false)).toBe('PRESENT_OT');
    expect(cellState({ status: 'LATE', otMinutes: 0 }, false)).toBe('PRESENT');
  });

  it('half day, absent and leave are recorded states', () => {
    expect(cellState({ status: 'HALF_DAY', otMinutes: 0 }, false)).toBe('HALF');
    expect(cellState({ status: 'ABSENT', otMinutes: 0 }, false)).toBe('ABSENT');
    expect(cellState({ status: 'LEAVE', otMinutes: 0 }, false)).toBe('LEAVE');
  });

  it('no row and no approved leave is NOT RECORDED — never absent', () => {
    expect(cellState(null, false)).toBe('NONE');
  });

  it('an approved leave request makes an unrecorded day leave', () => {
    expect(cellState(null, true)).toBe('LEAVE');
  });

  it('a recorded row wins over a leave request: they came in', () => {
    expect(cellState({ status: 'PRESENT', otMinutes: 0 }, true)).toBe('PRESENT');
    expect(cellState({ status: 'ABSENT', otMinutes: 0 }, true)).toBe('ABSENT');
  });

  it('an unfamiliar status stays visible as OTHER, not a missing day', () => {
    expect(cellState({ status: 'WFH', otMinutes: 0 }, false)).toBe('OTHER');
  });

  it('...and it is tallied as OTHER — never folded into "not recorded"', () => {
    const m = buildMonthMatrix([emp('a')], [rec('a', 1, 'WFH'), rec('a', 2, 'PRESENT')], [], '2026-08');
    expect(m.rows[0].counts).toMatchObject({ other: 1, present: 1, none: 29 });
    expect(m.totals).toMatchObject({ other: 1, none: 29 });
    expect(m.identityHolds).toBe(true);
  });
});

const emp = (id: string, name = id): MatrixEmployee => ({ id, name, code: `C-${id}`, department: 'Printing' });
const rec = (employeeId: string, day: number, status = 'PRESENT', otMinutes = 0): MatrixRecord => ({ employeeId, dateKey: `2026-08-${String(day).padStart(2, '0')}`, status, otMinutes });

describe('buildMonthMatrix — the footer is the sum of the visible cells', () => {
  const employees = [emp('a'), emp('b')];
  const records: MatrixRecord[] = [
    ...Array.from({ length: 20 }, (_, i) => rec('a', i + 1, 'PRESENT', i === 2 ? 180 : 0)),
    rec('a', 21, 'ABSENT'),
    rec('a', 22, 'HALF_DAY'),
    ...Array.from({ length: 10 }, (_, i) => rec('b', i + 1)),
    rec('b', 11, 'LEAVE'),
    rec('b', 12, 'ABSENT'),
  ];
  const m = buildMonthMatrix(employees, records, [{ employeeId: 'b', dateKey: '2026-08-13' }], '2026-08');

  it('every row has exactly one cell per calendar day', () => {
    expect(m.days).toHaveLength(31);
    for (const row of m.rows) expect(row.cells).toHaveLength(31);
  });

  it('a row\'s counts are a tally of its own cells', () => {
    const a = m.rows[0];
    expect(a.counts).toEqual({ present: 20, half: 1, absent: 1, leave: 0, none: 9, other: 0, otMinutes: 180 });
    expect(a.cells.filter((c) => c === 'PRESENT_OT')).toHaveLength(1);
    const b = m.rows[1];
    expect(b.counts).toMatchObject({ present: 10, absent: 1, leave: 2, none: 18 }); // leave = a row + an approved request
  });

  it('the pool\'s totals are the sum of the rows, and slots = workers × days', () => {
    expect(m.totals).toMatchObject({ workers: 2, days: 31, slots: 62, present: 30, half: 1, absent: 2, leave: 2, none: 27, otMinutes: 180 });
    expect(m.identityHolds).toBe(true);
  });

  it('the identity holds however the month is filled — property check over many patterns', () => {
    const statuses = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'LATE', 'WFH'];
    for (let seed = 1; seed <= 40; seed += 1) {
      const rs: MatrixRecord[] = [];
      for (let e = 0; e < 5; e += 1) {
        for (let d = 1; d <= 31; d += 1) {
          const roll = (seed * 31 + e * 7 + d * 13) % 9;
          if (roll < 6) rs.push(rec(`e${e}`, d, statuses[roll % statuses.length], roll % 2 ? 30 : 0));
        }
      }
      const emps = [0, 1, 2, 3, 4].map((e) => emp(`e${e}`));
      const mm = buildMonthMatrix(emps, rs, [{ employeeId: 'e0', dateKey: '2026-08-31' }], '2026-08');
      expect(mm.identityHolds).toBe(true);
      const t = mm.totals;
      expect(t.present + t.half + t.absent + t.leave + t.none + t.other).toBe(155);
    }
  });

  it('a record outside the month, or for someone not in the list, is ignored — it cannot bend the identity', () => {
    const mm = buildMonthMatrix([emp('a')], [
      { employeeId: 'a', dateKey: '2026-07-31', status: 'PRESENT', otMinutes: 0 },
      { employeeId: 'a', dateKey: '2026-09-01', status: 'PRESENT', otMinutes: 0 },
      { employeeId: 'ghost', dateKey: '2026-08-05', status: 'PRESENT', otMinutes: 0 },
    ], [{ employeeId: 'a', dateKey: '2026-09-02' }], '2026-08');
    expect(mm.totals).toMatchObject({ present: 0, none: 31, slots: 31 });
    expect(mm.identityHolds).toBe(true);
  });

  it('overtime is counted only on a day someone worked', () => {
    const mm = buildMonthMatrix([emp('a')], [rec('a', 1, 'ABSENT', 500), rec('a', 2, 'LEAVE', 500), rec('a', 3, 'PRESENT', 60), rec('a', 4, 'HALF_DAY', 30)], [], '2026-08');
    expect(mm.totals.otMinutes).toBe(90);
  });

  it('nobody in the pool is an empty matrix, not a crash', () => {
    const mm = buildMonthMatrix([], [], [], '2026-08');
    expect(mm.rows).toEqual([]);
    expect(mm.totals).toMatchObject({ workers: 0, slots: 0 });
    expect(mm.identityHolds).toBe(true);
  });
});

describe('the working, shown', () => {
  const IST = 'Asia/Kolkata';
  const shift = { name: 'Shift 1', startTime: '06:00', endTime: '15:00' };
  // 06:04 IST = 00:34 UTC; 18:02 IST = 12:32 UTC.
  const at = (hhmmUtc: string) => new Date(`2026-08-28T${hhmmUtc}:00Z`);

  it('the artboard\'s own example: 18:02 − 06:04 is 11 h 58 min (the artboard prints 12.0 — rounded BEFORE subtracting), so 2 h 58 min over a nine-hour shift', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('00:34'), clockOut: at('12:32'), otMinutes: 238, lateMinutes: 4, shift }, IST);
    expect(d).toMatchObject({ inLabel: '06:04', outLabel: '18:02', workedMinutes: 718, shiftMinutes: 540, impliedOtMinutes: 178, shiftLabel: '06:00 – 15:00' });
    expect(d.otAgrees).toBe(false); // recorded 238 vs implied 178 — the screen must say so
  });

  it('subtracts whole minutes on the factory clock: seconds never tip the result', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: new Date('2026-08-28T00:34:59Z'), clockOut: new Date('2026-08-28T12:32:01Z'), otMinutes: 0, lateMinutes: 0, shift }, IST);
    expect(d.inLabel).toBe('06:04');
    expect(d.outLabel).toBe('18:02');
    expect(d.workedMinutes).toBe(718); // 18:02 − 06:04, exactly what the two labels say
  });

  it('when recorded overtime equals what the punches imply, it says they agree', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('00:30'), clockOut: at('12:30'), otMinutes: 180, lateMinutes: 0, shift }, IST);
    expect(d.impliedOtMinutes).toBe(180);
    expect(d.otAgrees).toBe(true);
  });

  it('a day shorter than the shift implies no overtime — never negative', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('00:30'), clockOut: at('06:00'), otMinutes: 0, lateMinutes: 0, shift }, IST);
    expect(d.impliedOtMinutes).toBe(0);
    expect(d.otAgrees).toBe(true);
  });

  it('no out punch → no worked time, no implied overtime, nothing to compare — not zero', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('00:34'), clockOut: null, otMinutes: 0, lateMinutes: 0, shift }, IST);
    expect(d).toMatchObject({ inLabel: '06:04', outLabel: null, workedMinutes: null, impliedOtMinutes: null, otAgrees: null });
  });

  it('an out before the in is bad data: no worked time is invented', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('12:00'), clockOut: at('00:30'), otMinutes: 0, lateMinutes: 0, shift }, IST);
    expect(d.workedMinutes).toBeNull();
    expect(d.otAgrees).toBeNull();
  });

  it('no shift recorded on the row → the shift length and implied overtime are unknown, not a guess', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('00:34'), clockOut: at('12:32'), otMinutes: 60, lateMinutes: 0, shift: null }, IST);
    expect(d).toMatchObject({ shiftName: null, shiftMinutes: null, impliedOtMinutes: null, otAgrees: null, workedMinutes: 718 });
  });

  it('an overnight shift is measured across midnight', () => {
    const d = dayDetail({ status: 'PRESENT', clockIn: at('16:30'), clockOut: new Date('2026-08-29T00:30:00Z'), otMinutes: 0, lateMinutes: 0, shift: { name: 'Night', startTime: '22:00', endTime: '06:00' } }, IST);
    expect(d.shiftMinutes).toBe(480);
    expect(d.workedMinutes).toBe(480);
    expect(d.impliedOtMinutes).toBe(0);
  });

  it('the zone matters: the same punch reads 00:34 on a UTC clock', () => {
    expect(dayDetail({ status: 'PRESENT', clockIn: at('00:34'), clockOut: null, otMinutes: 0, lateMinutes: 0, shift }, 'UTC').inLabel).toBe('00:34');
  });

  it('durations are exact minutes, never a rounded decimal', () => {
    expect(durationLabel(718)).toBe('11 h 58 min');
    expect(durationLabel(540)).toBe('9 h');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(0)).toBe('0 min');
    expect(durationLabel(65)).toBe('1 h 05 min');
    expect(durationLabel(-5)).toBe('0 min');
  });

  it('a column of hours is converted ONCE from whole minutes', () => {
    expect(hoursLabel(720)).toBe('12.0');
    expect(hoursLabel(90)).toBe('1.5');
    expect(hoursLabel(0)).toBe('0.0');
  });
});
