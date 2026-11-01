import { describe, expect, it } from 'vitest';
import { addMinutesToTime, expectedClockOut } from './shift-clock';

describe('R2-372 wall-clock arithmetic wraps past midnight', () => {
  it('22:30 + 8 h is 06:30, never 30:30', () => {
    expect(addMinutesToTime('22:30', 480)).toBe('06:30');
    expect(addMinutesToTime('23:59', 1)).toBe('00:00');
    expect(addMinutesToTime('06:15', 540)).toBe('15:15');
    expect(addMinutesToTime('01:00', -120)).toBe('23:00');
  });
  it('expectedClockOut: clock-in + shift length when a clock-in is given, else the shift end', () => {
    const night = { startTime: '22:00', endTime: '06:00' };
    const day = { startTime: '06:00', endTime: '15:00' };
    expect(expectedClockOut(night, '22:30')).toBe('06:30'); // R2-372
    expect(expectedClockOut(day, '06:15')).toBe('15:15'); // R2-370
    expect(expectedClockOut(day)).toBe('15:00'); // R2-369 / R2-371
    expect(expectedClockOut(day, '')).toBe('15:00');
    expect(expectedClockOut(day, '6:1')).toBe('15:00'); // half-typed: fall back to the shift end
  });
});
