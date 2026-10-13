import { describe, expect, it } from 'vitest';

import { bookingIntersectsShift, isDateKey, personMinutes, shiftDateKeyFor, shiftWindowInstants } from './crew-hours';

const TZ = 'Asia/Kolkata';
const ist = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00+05:30`);
const NIGHT = { startTime: '22:00', endTime: '06:00' };
const DAY = { startTime: '06:00', endTime: '14:00' };

describe('personMinutes (R3 B102)', () => {
  const shiftStart = ist('2026-10-13', '06:00');
  const shiftEnd = ist('2026-10-13', '14:00');
  const base = { createdAt: ist('2026-10-12', '17:00'), releasedAt: null, clockIn: null, shiftStart, shiftEnd, bookingEnd: ist('2026-10-13', '18:00'), now: ist('2026-10-13', '20:00') };

  it('an advance-assigned row starts at the shift start', () => {
    expect(personMinutes(base)).toBe(480);
  });
  it('released early ends at the release', () => {
    expect(personMinutes({ ...base, releasedAt: ist('2026-10-13', '09:00') })).toBe(180);
  });
  it('a late clock-in starts at the clock-in', () => {
    expect(personMinutes({ ...base, clockIn: ist('2026-10-13', '08:30') })).toBe(330);
  });
  it('a still-open row runs to now, capped by the shift and the booking end', () => {
    expect(personMinutes({ ...base, now: ist('2026-10-13', '10:00') })).toBe(240);
    expect(personMinutes({ ...base, bookingEnd: ist('2026-10-13', '12:00') })).toBe(360);
  });
  it('never negative', () => {
    expect(personMinutes({ ...base, releasedAt: ist('2026-10-13', '05:00') })).toBe(0);
  });
});

describe('shift windows', () => {
  it('a night shift ends on the next factory day', () => {
    const w = shiftWindowInstants('2026-10-13', NIGHT, TZ);
    expect(w.start.getTime()).toBe(ist('2026-10-13', '22:00').getTime());
    expect(w.end.getTime()).toBe(ist('2026-10-14', '06:00').getTime());
  });
  it('a booking 18:00-02:00 intersects the 22:00 shift on its start date, not the day before', () => {
    const booking = { startsAt: ist('2026-10-13', '18:00'), endsAt: ist('2026-10-14', '02:00') };
    expect(bookingIntersectsShift(booking, '2026-10-13', NIGHT, TZ)).toBe(true);
    expect(bookingIntersectsShift(booking, '2026-10-12', NIGHT, TZ)).toBe(false);
    expect(bookingIntersectsShift(booking, '2026-10-13', DAY, TZ)).toBe(false);
  });
  it('01:00 IST on the 14th belongs to the night shift that started on the 13th', () => {
    expect(shiftDateKeyFor(NIGHT, new Date('2026-10-13T19:30:00Z'), TZ)).toBe('2026-10-13');
    expect(shiftDateKeyFor(DAY, new Date('2026-10-13T19:30:00Z'), TZ)).toBe('2026-10-14');
  });
  it('isDateKey rejects timestamps and impossible days', () => {
    expect(isDateKey('2026-10-13')).toBe(true);
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-10-13T00:00:00Z')).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});
