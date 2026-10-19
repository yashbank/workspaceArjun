import { describe, expect, it } from 'vitest';

import { punchMinutes } from './punch-minutes';

const TZ = 'Asia/Kolkata';
const IST = 330 * 60_000;
/** IST wall clock on September `day`, 2026 → the instant. */
const ist = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 8, day, h, m) - IST);
const DAY = { startTime: '09:00', endTime: '18:00' };
const NIGHT = { startTime: '22:00', endTime: '06:00' };

describe('punchMinutes (R2-106)', () => {
  it('09:00–18:00 shift, in 09:45, out 20:00 → late 45, OT 120', () => {
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: ist(20, 9, 45), clockOut: ist(20, 20, 0) }, DAY, TZ)).toEqual({ lateMinutes: 45, otMinutes: 120 });
  });

  it('on time / early is 0, never negative', () => {
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: ist(20, 8, 50), clockOut: ist(20, 17, 59) }, DAY, TZ)).toEqual({ lateMinutes: 0, otMinutes: 0 });
  });

  it('night shift: in 23:05, out 06:40 next day → late 65, OT 40 (measured from the day the shift started)', () => {
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: ist(20, 23, 5), clockOut: ist(21, 6, 40) }, NIGHT, TZ)).toEqual({ lateMinutes: 65, otMinutes: 40 });
  });

  it('night shift: a clock-in after midnight is still late against 22:00 (00:15 → 135)', () => {
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: ist(21, 0, 15), clockOut: null }, NIGHT, TZ)).toEqual({ lateMinutes: 135, otMinutes: null });
  });

  it('a missing side is null (unknown), and no shift means nothing can be derived', () => {
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: null, clockOut: ist(20, 19, 0) }, DAY, TZ)).toEqual({ lateMinutes: null, otMinutes: 60 });
    expect(punchMinutes({ workDate: '2026-09-20', clockIn: ist(20, 10, 0), clockOut: null }, null, TZ)).toEqual({ lateMinutes: null, otMinutes: null });
  });
});
