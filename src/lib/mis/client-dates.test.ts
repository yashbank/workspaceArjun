import { describe, expect, it } from 'vitest';

import { factoryHour, fmtDate, fmtDateTime, fmtTime } from './client-dates';

// 2026-10-09T20:30:00Z is 02:00 IST on the 10th — a UTC server and an IST browser used to disagree.
const AT = new Date('2026-10-09T20:30:00Z');

describe('client-dates pin the factory zone', () => {
  it('date, time and date-time all read as IST whatever the machine zone', () => {
    expect(fmtDate(AT)).toBe('10/10/2026');
    expect(fmtDate(AT, { day: '2-digit', month: 'short' })).toBe('10 Oct');
    expect(fmtTime(AT, { hour: '2-digit', minute: '2-digit' })).toBe('02:00 am');
    expect(fmtDateTime(AT)).toMatch(/^10\/10\/2026, 2:00:00 am$/i);
    expect(factoryHour(AT)).toBe(2);
  });
  it('accepts ISO strings (what a server component sends to a client one)', () => {
    expect(fmtDate(AT.toISOString())).toBe('10/10/2026');
  });
});
