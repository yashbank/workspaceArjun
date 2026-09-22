/**
 * 24G-part1 gap 3/5 — the age pill on an approval row (R1 "Waiting on you", D1 widget).
 */
import { describe, expect, it } from 'vitest';

import { shortAge } from './relative-age';

const NOW = new Date('2026-09-22T12:00:00.000Z');

describe('shortAge', () => {
  it('abbreviates hours', () => {
    expect(shortAge(new Date('2026-09-22T08:00:00.000Z'), NOW)).toBe('4 hrs');
  });

  it('abbreviates a single hour', () => {
    expect(shortAge(new Date('2026-09-22T11:00:00.000Z'), NOW)).toBe('1 hrs');
  });

  it('abbreviates minutes', () => {
    expect(shortAge(new Date('2026-09-22T11:40:00.000Z'), NOW)).toBe('20 min');
  });

  it('keeps the date-fns word for days', () => {
    expect(shortAge(new Date('2026-09-20T12:00:00.000Z'), NOW)).toBe('2 days');
  });

  it('keeps the date-fns word for months', () => {
    expect(shortAge(new Date('2026-07-22T12:00:00.000Z'), NOW)).toBe('2 months');
  });
});
