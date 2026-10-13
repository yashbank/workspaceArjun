import { describe, expect, it } from 'vitest';

import { classifyLogAgainstBookings, worstFlag, type BookingWindow } from './machine-sync';

const at = new Date('2026-10-13T06:00:00Z');
const booking = (over: Partial<BookingWindow> = {}): BookingWindow => ({
  machineId: 'm1',
  orderId: 'o1',
  startsAt: new Date('2026-10-13T04:00:00Z'),
  endsAt: new Date('2026-10-13T10:00:00Z'),
  releasedAt: null,
  ...over,
});

describe('classifyLogAgainstBookings (R3 B99)', () => {
  const log = { machineId: 'm1', orderId: 'o1', at };
  it('OK for a live booking of the same order', () => {
    expect(classifyLogAgainstBookings(log, [booking()])).toBe('OK');
  });
  it('OTHER_ORDER when the machine is booked for another order', () => {
    expect(classifyLogAgainstBookings(log, [booking({ orderId: 'o2' })])).toBe('OTHER_ORDER');
  });
  it('NO_BOOKING when nothing covers the moment', () => {
    expect(classifyLogAgainstBookings(log, [])).toBe('NO_BOOKING');
    expect(classifyLogAgainstBookings(log, [booking({ endsAt: new Date('2026-10-13T05:00:00Z') })])).toBe('NO_BOOKING');
    expect(classifyLogAgainstBookings(log, [booking({ machineId: 'm2' })])).toBe('NO_BOOKING');
  });
  it('a released booking is NO_BOOKING', () => {
    expect(classifyLogAgainstBookings(log, [booking({ releasedAt: new Date('2026-10-13T05:00:00Z') })])).toBe('NO_BOOKING');
  });
  it('the worst flag wins', () => {
    expect(worstFlag(['OK', 'OTHER_ORDER', 'NO_BOOKING'])).toBe('NO_BOOKING');
    expect(worstFlag(['OK', 'OTHER_ORDER'])).toBe('OTHER_ORDER');
    expect(worstFlag([])).toBeNull();
  });
});
