import { describe, it, expect } from 'vitest';
import {
  calendarDayToUtc,
  isCreatedOnLocalDay,
  parseActivityDateRange,
} from './activity-dates';

/** India Standard Time: UTC+5:30 → getTimezoneOffset() = -330 */
const IST_OFFSET = -330;

describe('parseActivityDateRange with tzOffset', () => {
  it('end of 20 May IST is 20 May 18:29:59.999 UTC', () => {
    const { to } = parseActivityDateRange('2026-05-19', '2026-05-20', IST_OFFSET);
    expect(to.toISOString()).toBe('2026-05-20T18:29:59.999Z');
  });

  it('start of 19 May IST is 18 May 18:30 UTC', () => {
    const { from } = parseActivityDateRange('2026-05-19', '2026-05-20', IST_OFFSET);
    expect(from.toISOString()).toBe('2026-05-18T18:30:00.000Z');
  });

  it('excludes event on 21 May 00:30 IST when filtering to 20 May', () => {
    const { from, to } = parseActivityDateRange('2026-05-19', '2026-05-20', IST_OFFSET);
    const may21EarlyIst = new Date('2026-05-20T19:00:00.000Z'); // 21 May 00:30 IST
    expect(may21EarlyIst > to).toBe(true);
    expect(may21EarlyIst >= from).toBe(true);
  });

  it('includes event on 20 May 22:00 IST', () => {
    const { to } = parseActivityDateRange('2026-05-19', '2026-05-20', IST_OFFSET);
    const may20LateIst = new Date('2026-05-20T16:30:00.000Z'); // 20 May 22:00 IST
    expect(may20LateIst <= to).toBe(true);
  });
});

describe('isCreatedOnLocalDay', () => {
  it('matches same local calendar day in IST', () => {
    const created = new Date('2026-05-20T12:00:00.000Z'); // 20 May 17:30 IST
    expect(isCreatedOnLocalDay(created, '2026-05-20', IST_OFFSET)).toBe(true);
    expect(isCreatedOnLocalDay(created, '2026-05-21', IST_OFFSET)).toBe(false);
  });
});

describe('calendarDayToUtc US Eastern', () => {
  /** US Eastern (UTC-4 DST): offset +240 */
  const EDT_OFFSET = 240;

  it('end of day in EDT', () => {
    const end = calendarDayToUtc('2026-05-20', true, EDT_OFFSET);
    expect(end.toISOString()).toBe('2026-05-21T03:59:59.999Z');
  });
});
