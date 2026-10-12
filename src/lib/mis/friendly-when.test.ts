import { describe, expect, it } from 'vitest';

import { friendlyWhen } from './factory-time';

describe('friendlyWhen', () => {
  it('reads 12-hour in IST', () => {
    expect(friendlyWhen(new Date('2026-09-20T12:34:00Z'), 'Asia/Kolkata')).toBe('20/09/2026 6:04 pm');
  });
  it('a UTC instant just before midnight is already tomorrow morning in IST', () => {
    expect(friendlyWhen(new Date('2026-09-20T18:35:00Z'), 'Asia/Kolkata')).toBe('21/09/2026 12:05 am');
  });
  it('noon is 12 pm and the factory zone, not the UTC date, decides the day', () => {
    expect(friendlyWhen(new Date('2026-09-20T06:30:00Z'), 'Asia/Kolkata')).toBe('20/09/2026 12:00 pm');
    expect(friendlyWhen(new Date('2026-09-20T23:59:00Z'), 'UTC')).toBe('20/09/2026 11:59 pm');
  });
});
