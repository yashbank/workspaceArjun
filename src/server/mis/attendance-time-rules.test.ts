import { describe, expect, it } from 'vitest';

import type { PunchFact } from '@/lib/mis/attendance-day';

import {
  checkClockInWindow,
  deriveDaysSplittingStale,
  earlyDepartureMinutes,
  isStaleOpenIn,
  openInBefore,
  payableWorkedMinutes,
  PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES,
} from './attendance-payroll-rules';

const TZ = 'Asia/Kolkata';
/** An instant from an IST wall-clock time. */
const ist = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);
const DAY = { id: 's-day', name: 'Morning', startTime: '06:00', endTime: '14:00' };
const NIGHT = { id: 's-night', name: 'Night', startTime: '22:00', endTime: '06:00' };
const punch = (id: string, direction: 'IN' | 'OUT', at: Date, shiftId: string | null = null): PunchFact => ({ id, direction, punchedAt: at, shiftId });

describe('R2-210 clock-in window', () => {
  it('buffer is 30 minutes', () => expect(PRE_SHIFT_CLOCK_IN_BUFFER_MINUTES).toBe(30));
  it('allows 05:30 to the shift end, rejects 05:29 and after the end', () => {
    expect(checkClockInWindow(ist('2026-10-13', '05:30'), [DAY], TZ).allowed).toBe(true);
    expect(checkClockInWindow(ist('2026-10-13', '14:00'), [DAY], TZ).allowed).toBe(true);
    const early = checkClockInWindow(ist('2026-10-13', '05:29'), [DAY], TZ);
    expect(early.allowed).toBe(false);
    expect(!early.allowed && early.message).toMatch(/05:30 to 14:00/);
    expect(checkClockInWindow(ist('2026-10-13', '14:01'), [DAY], TZ).allowed).toBe(false);
  });
  it('rejects a 03:00 punch for a day shift', () => expect(checkClockInWindow(ist('2026-10-13', '03:00'), [DAY], TZ).allowed).toBe(false));
  it('handles a night shift across midnight', () => {
    expect(checkClockInWindow(ist('2026-10-13', '21:30'), [NIGHT], TZ).allowed).toBe(true);
    expect(checkClockInWindow(ist('2026-10-14', '01:00'), [NIGHT], TZ).allowed).toBe(true);
    expect(checkClockInWindow(ist('2026-10-14', '06:30'), [NIGHT], TZ).allowed).toBe(false);
  });
  it('any of several shifts will do; no shifts means nothing to check', () => {
    expect(checkClockInWindow(ist('2026-10-13', '21:45'), [DAY, NIGHT], TZ).allowed).toBe(true);
    expect(checkClockInWindow(ist('2026-10-13', '03:00'), [], TZ).allowed).toBe(true);
  });
});

describe('R2-211 payable minutes', () => {
  it('an early 05:15 punch counts from 06:00', () => {
    const day = { workDate: '2026-10-13', clockIn: ist('2026-10-13', '05:15'), clockOut: ist('2026-10-13', '14:00') };
    expect(payableWorkedMinutes(day, DAY, TZ)).toBe(480);
  });
  it('a late or on-time punch is counted from the punch; null until both punches exist', () => {
    const late = { workDate: '2026-10-13', clockIn: ist('2026-10-13', '06:20'), clockOut: ist('2026-10-13', '14:00') };
    expect(payableWorkedMinutes(late, DAY, TZ)).toBe(460);
    expect(payableWorkedMinutes({ ...late, clockOut: null }, DAY, TZ)).toBeNull();
  });
  it('never turns into overtime: early in, on-time out is exactly the shift', () => {
    const day = { workDate: '2026-10-13', clockIn: ist('2026-10-13', '04:00'), clockOut: ist('2026-10-13', '14:00') };
    expect(payableWorkedMinutes(day, DAY, TZ)).toBe(480);
  });
});

describe('R2-215 early departure', () => {
  it('minutes before shift end; 0 when on time, later, or still in', () => {
    const base = { workDate: '2026-10-13', clockIn: ist('2026-10-13', '06:00') };
    expect(earlyDepartureMinutes({ ...base, clockOut: ist('2026-10-13', '13:15') }, DAY, TZ)).toBe(45);
    expect(earlyDepartureMinutes({ ...base, clockOut: ist('2026-10-13', '14:00') }, DAY, TZ)).toBe(0);
    expect(earlyDepartureMinutes({ ...base, clockOut: ist('2026-10-13', '15:30') }, DAY, TZ)).toBe(0);
    expect(earlyDepartureMinutes({ ...base, clockOut: null }, DAY, TZ)).toBe(0);
  });
  it('night shift measures against the next morning', () => {
    const day = { workDate: '2026-10-13', clockIn: ist('2026-10-13', '22:00'), clockOut: ist('2026-10-14', '05:00') };
    expect(earlyDepartureMinutes(day, NIGHT, TZ)).toBe(60);
  });
});

describe('R2-213 stale open clock-in', () => {
  const shifts = [DAY, NIGHT];
  it('an IN from yesterday afternoon is stale for a 05:30 scan; yesterday night shift IN is not stale at 06:00', () => {
    const forgotten = punch('a', 'IN', ist('2026-10-12', '14:00'), DAY.id);
    expect(isStaleOpenIn(forgotten, ist('2026-10-13', '05:30'), DAY.id, shifts, TZ)).toBe(true);
    const night = punch('b', 'IN', ist('2026-10-12', '22:00'), NIGHT.id);
    expect(isStaleOpenIn(night, ist('2026-10-13', '06:00'), DAY.id, shifts, TZ)).toBe(false);
  });
  it('over 16 hours is always stale; a same-day IN is not', () => {
    expect(isStaleOpenIn(punch('a', 'IN', ist('2026-10-12', '06:00')), ist('2026-10-13', '05:00'), null, shifts, TZ)).toBe(true);
    expect(isStaleOpenIn(punch('a', 'IN', ist('2026-10-13', '06:00')), ist('2026-10-13', '13:00'), null, shifts, TZ)).toBe(false);
  });
  it('openInBefore finds only a trailing IN', () => {
    const list = [punch('a', 'IN', ist('2026-10-12', '06:00')), punch('b', 'OUT', ist('2026-10-12', '14:00'))];
    expect(openInBefore(list, ist('2026-10-13', '06:00'))).toBeNull();
    expect(openInBefore(list.slice(0, 1), ist('2026-10-13', '06:00'))?.id).toBe('a');
  });
  it('a new IN after a forgotten one starts its own day instead of being absorbed', () => {
    const forgotten = punch('a', 'IN', ist('2026-10-12', '14:00'), DAY.id);
    const today = punch('b', 'IN', ist('2026-10-13', '05:45'), DAY.id);
    const days = deriveDaysSplittingStale([forgotten, today], shifts, TZ);
    expect([...days.keys()].sort()).toEqual(['2026-10-12', '2026-10-13']);
    expect(days.get('2026-10-12')?.clockOut).toBeNull();
    expect(days.get('2026-10-13')?.clockIn).toEqual(today.punchedAt);
    const out = punch('c', 'OUT', ist('2026-10-13', '14:00'), DAY.id);
    const full = deriveDaysSplittingStale([forgotten, today, out], shifts, TZ);
    expect(full.get('2026-10-13')?.clockOut).toEqual(out.punchedAt);
    expect(full.get('2026-10-12')?.clockOut).toBeNull();
  });
});
