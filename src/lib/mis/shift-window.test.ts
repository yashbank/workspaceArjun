import { describe, expect, it } from 'vitest';

import {
  isMinuteInShiftWindow,
  resolveShiftAt,
  shiftDurationMinutes,
  shiftsOverlap,
  shiftWrapsMidnight,
  timeToMinutes,
} from './shift-window';

describe('timeToMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeToMinutes('06:00')).toBe(360);
    expect(timeToMinutes('23:45')).toBe(1425);
  });

  it('reads malformed input as 0, never NaN', () => {
    expect(timeToMinutes('bad')).toBe(0);
    expect(Number.isNaN(timeToMinutes(''))).toBe(false);
  });
});

describe('shiftDurationMinutes', () => {
  it('computes a same-day shift', () => {
    expect(shiftDurationMinutes({ startTime: '06:00', endTime: '15:00' })).toBe(540);
  });

  it('wraps a night shift past midnight', () => {
    expect(shiftDurationMinutes({ startTime: '22:00', endTime: '06:00' })).toBe(480);
  });
});

describe('isMinuteInShiftWindow', () => {
  const day = { startTime: '06:00', endTime: '15:00' };
  const night = { startTime: '22:00', endTime: '06:00' };

  it('is true inside a same-day window, false outside it', () => {
    expect(isMinuteInShiftWindow(timeToMinutes('10:00'), day)).toBe(true);
    expect(isMinuteInShiftWindow(timeToMinutes('20:00'), day)).toBe(false);
  });

  it('wraps correctly for a night shift on both sides of midnight', () => {
    expect(isMinuteInShiftWindow(timeToMinutes('23:30'), night)).toBe(true);
    expect(isMinuteInShiftWindow(timeToMinutes('02:00'), night)).toBe(true);
    expect(isMinuteInShiftWindow(timeToMinutes('12:00'), night)).toBe(false);
  });
});

describe('resolveShiftAt', () => {
  // The signature gained a required timezone in Phase 13 (D22): a shift window is a wall-clock
  // time at the plant. Instants are built from IST readings, so these tests are machine-independent.
  const TZ = 'Asia/Kolkata';
  const ist = (h: number, m = 0) => new Date(Date.UTC(2026, 0, 1, h, m) - 330 * 60_000);
  const shifts = [
    { id: 's1', name: 'Morning', startTime: '06:00', endTime: '15:00', isDefault: true },
    { id: 's2', name: 'Night', startTime: '22:00', endTime: '06:00', isDefault: false },
  ];

  it('returns null for an empty list', () => {
    expect(resolveShiftAt([], new Date(), TZ)).toBeNull();
  });

  it('picks the shift whose window contains the time', () => {
    expect(resolveShiftAt(shifts, ist(10), TZ)?.id).toBe('s1');
  });

  it('falls back to the default when no window matches', () => {
    expect(resolveShiftAt(shifts, ist(18), TZ)?.id).toBe('s1'); // between shifts
  });

  it('falls back to the first shift when nothing is marked default', () => {
    const noDefault = shifts.map((s) => ({ ...s, isDefault: false }));
    expect(resolveShiftAt(noDefault, ist(18), TZ)?.id).toBe('s1');
  });

  it('reads the window on the FACTORY’s clock: the same instant is a different shift in another zone (D22)', () => {
    const t = ist(23, 30); // 23:30 IST = night shift at the plant, 02:00 in Singapore
    expect(resolveShiftAt(shifts, t, TZ)?.id).toBe('s2');
    expect(resolveShiftAt(shifts, t, 'Asia/Singapore')?.id).toBe('s2'); // 02:00 is also night…
    const early = ist(7); // 07:00 IST = morning at the plant, 09:30 in Singapore (still morning)
    expect(resolveShiftAt(shifts, early, TZ)?.id).toBe('s1');
    const changeover = ist(5, 30); // 05:30 IST = night; 08:00 in Singapore = morning
    expect(resolveShiftAt(shifts, changeover, TZ)?.id).toBe('s2');
    expect(resolveShiftAt(shifts, changeover, 'Asia/Singapore')?.id).toBe('s1');
  });
});

describe('shiftsOverlap', () => {
  const morning = { startTime: '06:00', endTime: '14:00' };
  const afternoon = { startTime: '14:00', endTime: '22:00' };
  const dayA = new Date(2026, 0, 1);
  const dayB = new Date(2026, 0, 2);

  it('is true for the same shift on the same day', () => {
    expect(shiftsOverlap(morning, dayA, morning, dayA)).toBe(true);
  });

  it('is false on different days', () => {
    expect(shiftsOverlap(morning, dayA, morning, dayB)).toBe(false);
  });

  it('is false for adjoining shifts that only touch at the edge', () => {
    expect(shiftsOverlap(morning, dayA, afternoon, dayA)).toBe(false);
  });
});

describe('shiftWrapsMidnight', () => {
  it('is true for a night shift and false for a day shift', () => {
    expect(shiftWrapsMidnight({ startTime: '22:00', endTime: '06:00' })).toBe(true);
    expect(shiftWrapsMidnight({ startTime: '06:00', endTime: '14:00' })).toBe(false);
  });

  it('treats an end equal to the start as a full-day wrap, matching shiftDurationMinutes', () => {
    expect(shiftWrapsMidnight({ startTime: '08:00', endTime: '08:00' })).toBe(true);
    expect(shiftDurationMinutes({ startTime: '08:00', endTime: '08:00' })).toBe(1440);
  });
});
