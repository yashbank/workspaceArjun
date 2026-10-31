import { describe, expect, it } from 'vitest';
import { cutRosterRange, resolveShiftForDate, rosterRangesOverlap } from './shift-roster';

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

describe('R2-337 cutRosterRange keeps the days the new range does not claim', () => {
  const october = { startDate: '2026-10-01', endDate: '2026-10-31' };
  it('a week in the middle leaves a head and a tail', () => {
    expect(cutRosterRange(october, { startDate: '2026-10-20', endDate: '2026-10-27' })).toEqual({
      head: { startDate: '2026-10-01', endDate: '2026-10-19' },
      tail: { startDate: '2026-10-28', endDate: '2026-10-31' },
    });
  });
  it('an overlap at the start leaves only a tail; at the end only a head; a full cover leaves nothing', () => {
    expect(cutRosterRange(october, { startDate: '2026-09-25', endDate: '2026-10-05' })).toEqual({ head: null, tail: { startDate: '2026-10-06', endDate: '2026-10-31' } });
    expect(cutRosterRange(october, { startDate: '2026-10-25', endDate: '2026-11-05' })).toEqual({ head: { startDate: '2026-10-01', endDate: '2026-10-24' }, tail: null });
    expect(cutRosterRange(october, { startDate: '2026-09-01', endDate: '2026-12-31' })).toEqual({ head: null, tail: null });
  });
  it('reads Date rows as their UTC calendar day', () => {
    expect(cutRosterRange({ startDate: new Date('2026-10-01T00:00:00Z'), endDate: new Date('2026-10-31T00:00:00Z') }, { startDate: '2026-10-31', endDate: '2026-10-31' })).toEqual({
      head: { startDate: '2026-10-01', endDate: '2026-10-30' }, tail: null,
    });
  });
});
