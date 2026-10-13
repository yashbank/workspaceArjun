import { describe, expect, it } from 'vitest';

import { presenceOf } from './presence';

const t = (h: number) => new Date(Date.UTC(2026, 9, 13, h, 0));

describe('presenceOf (R3 B89)', () => {
  it('IN: clocked in and not out', () => {
    expect(presenceOf({ attendance: { clockIn: t(1), clockOut: null, status: 'PRESENT' }, onApprovedLeave: false })).toBe('IN');
  });
  it('OUT: clocked out at 10:00 is not available-green', () => {
    expect(presenceOf({ attendance: { clockIn: t(1), clockOut: t(4), status: 'PRESENT' }, onApprovedLeave: false })).toBe('OUT');
  });
  it('LEAVE: an approved leave that day', () => {
    expect(presenceOf({ attendance: null, onApprovedLeave: true })).toBe('LEAVE');
  });
  it('ABSENT: the register says so', () => {
    expect(presenceOf({ attendance: { clockIn: null, clockOut: null, status: 'ABSENT' }, onApprovedLeave: false })).toBe('ABSENT');
  });
  it('NOT_IN: nothing recorded', () => {
    expect(presenceOf({ attendance: null, onApprovedLeave: false })).toBe('NOT_IN');
    expect(presenceOf({ attendance: { clockIn: null, clockOut: null, status: 'PRESENT' }, onApprovedLeave: false })).toBe('NOT_IN');
  });
});
