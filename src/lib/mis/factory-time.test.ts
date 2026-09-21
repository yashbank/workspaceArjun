import { describe, expect, it } from 'vitest';

import {
  addDaysToDateKey,
  dateKeyToDbDate,
  DEFAULT_FACTORY_TIMEZONE,
  factoryDateKey,
  factoryMinuteOfDay,
  formatFactoryDate,
  formatFactoryDateTime,
  formatFactoryTime,
  isValidTimeZone,
  previousDateKey,
  resolveFactoryTimezone,
} from './factory-time';

const IST = 'Asia/Kolkata';
const SGT = 'Asia/Singapore'; // UTC+8 — the database's region (D22)

// 06:20 IST on 21 Sep = 00:50 UTC = 08:50 in Singapore.
const nightOut = new Date('2026-09-21T00:50:00Z');

describe('the factory zone, not the server’s (D22)', () => {
  it('the SAME instant is a different clock reading — and a different day — in two zones', () => {
    // 23:30 IST on the 20th is 02:00 on the 21st in UTC+8.
    const t = new Date('2026-09-20T18:00:00Z');
    expect(factoryDateKey(t, IST)).toBe('2026-09-20');
    expect(factoryDateKey(t, SGT)).toBe('2026-09-21');
    expect(factoryMinuteOfDay(t, IST)).toBe(23 * 60 + 30);
    expect(factoryMinuteOfDay(t, SGT)).toBe(2 * 60);
  });

  it('reads a night-shift clock-out as 06:20 in India and 08:50 on the database’s clock', () => {
    expect(formatFactoryTime(nightOut, IST)).toBe('06:20');
    expect(formatFactoryTime(nightOut, SGT)).toBe('08:50');
  });

  it('is independent of the machine running the test', () => {
    // Would differ between a UTC, an IST and a UTC+8 machine if it used local getters.
    expect(factoryDateKey(new Date('2026-09-20T19:00:00Z'), IST)).toBe('2026-09-21');
    expect(factoryDateKey(new Date('2026-09-20T18:29:00Z'), IST)).toBe('2026-09-20');
  });

  it('never returns hour 24 at midnight', () => {
    expect(factoryMinuteOfDay(new Date('2026-09-20T18:30:00Z'), IST)).toBe(0);
    expect(formatFactoryTime(new Date('2026-09-20T18:30:00Z'), IST)).toBe('00:00');
  });
});

describe('zone validity and the fallback', () => {
  it('accepts IANA zones and refuses everything else', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    for (const bad of ['', '  ', 'Mars/Olympus', 'IST', 'Asia/Kolkata; DROP TABLE', 42, null, undefined]) {
      expect(isValidTimeZone(bad), String(bad)).toBe(false);
    }
  });

  it('falls back to the seeded default — a named constant, never the environment', () => {
    expect(DEFAULT_FACTORY_TIMEZONE).toBe('Asia/Kolkata');
    expect(resolveFactoryTimezone(null)).toBe('Asia/Kolkata');
    expect(resolveFactoryTimezone('Not/AZone')).toBe('Asia/Kolkata');
    expect(resolveFactoryTimezone(' Asia/Singapore ')).toBe('Asia/Singapore');
  });
});

describe('date keys are pure calendar arithmetic', () => {
  it('steps over month, year and leap boundaries', () => {
    expect(previousDateKey('2026-10-01')).toBe('2026-09-30');
    expect(previousDateKey('2027-01-01')).toBe('2026-12-31');
    expect(previousDateKey('2028-03-01')).toBe('2028-02-29');
    expect(addDaysToDateKey('2026-09-30', 2)).toBe('2026-10-02');
    expect(addDaysToDateKey('2026-09-20', -3)).toBe('2026-09-17');
  });

  it('a db Date is UTC midnight of the key — what Prisma stores and new Date("yyyy-MM-dd") reads', () => {
    expect(dateKeyToDbDate('2026-09-20').toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(dateKeyToDbDate('2026-09-20').getTime()).toBe(new Date('2026-09-20').getTime());
  });
});

describe('formatFactoryDate / formatFactoryDateTime — one string on the server and in the browser (F-26)', () => {
  // 20 Sep 2026 22:00 UTC is already 21 Sep 03:30 in Kolkata — the day is the FACTORY's, whatever the machine's zone.
  const at = new Date('2026-09-20T22:00:00Z');

  it('writes dd/mm/yyyy in the factory zone', () => {
    expect(formatFactoryDate(at, 'Asia/Kolkata')).toBe('21/09/2026');
    expect(formatFactoryDate(at, 'UTC')).toBe('20/09/2026');
  });

  it('adds the factory time, 24-hour and zero-padded', () => {
    expect(formatFactoryDateTime(at, 'Asia/Kolkata')).toBe('21/09/2026 03:30');
    expect(formatFactoryDateTime(new Date('2026-01-05T00:04:00Z'), 'UTC')).toBe('05/01/2026 00:04');
  });

  it('does not depend on the process zone or locale', () => {
    const original = process.env.TZ;
    for (const tz of ['America/Los_Angeles', 'Asia/Singapore']) {
      process.env.TZ = tz;
      expect(formatFactoryDateTime(at, 'Asia/Kolkata')).toBe('21/09/2026 03:30');
    }
    process.env.TZ = original;
  });
});

