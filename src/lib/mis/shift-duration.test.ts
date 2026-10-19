import { describe, expect, it } from 'vitest';
import { shiftDuration } from './shift-duration';

describe('shiftDuration (R2-97)', () => {
  it('day shift', () => expect(shiftDuration('06:00', '14:30')).toBe('8h 30m'));
  it('night shift wrapping midnight', () => expect(shiftDuration('22:00', '06:00')).toBe('8h 0m'));
  it('identical or malformed times', () => {
    expect(shiftDuration('06:00', '06:00')).toBe('—');
    expect(shiftDuration('', '06:00')).toBe('—');
  });
});
