import { describe, expect, it } from 'vitest';
import { resolveShiftForDate, rosterRangesOverlap } from './shift-roster';

const rows = [
  { shiftId: 'A', startDate: '2026-11-02', endDate: '2026-11-08' },
  { shiftId: 'B', startDate: '2026-11-09', endDate: '2026-11-15' },
];

describe('resolveShiftForDate', () => {
  it('uses the roster entry covering the date, inclusive of both ends', () => {
    expect(resolveShiftForDate({ defaultShiftId: 'D' }, '2026-11-02', rows)).toBe('A');
    expect(resolveShiftForDate({ defaultShiftId: 'D' }, '2026-11-08', rows)).toBe('A');
    expect(resolveShiftForDate({ defaultShiftId: 'D' }, '2026-11-09', rows)).toBe('B');
  });
  it('falls back to the default shift, then null', () => {
    expect(resolveShiftForDate({ defaultShiftId: 'D' }, '2026-11-20', rows)).toBe('D');
    expect(resolveShiftForDate({ defaultShiftId: null }, '2026-11-20', rows)).toBeNull();
  });
  it('reads a Date as its UTC day', () => {
    expect(resolveShiftForDate({}, new Date(Date.UTC(2026, 10, 10)), rows.map((r) => ({ ...r, startDate: new Date(r.startDate), endDate: new Date(r.endDate) })))).toBe('B');
  });
});

describe('rosterRangesOverlap', () => {
  it('detects shared days and touching ends', () => {
    expect(rosterRangesOverlap(rows[0], { startDate: '2026-11-08', endDate: '2026-11-10' })).toBe(true);
    expect(rosterRangesOverlap(rows[0], rows[1])).toBe(false);
  });
});
