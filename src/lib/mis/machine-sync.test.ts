import { describe, expect, it } from 'vitest';

import { classifyLogAgainstBookings, decideMachineSync, LATE_ENTRY_GRACE_MS, worstFlag, type BookingWindow } from './machine-sync';

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

describe('R2-339 decideMachineSync extends a same-order booking that just ended', () => {
  const ended = (minutesAgo: number, over: Record<string, unknown> = {}) => ({
    id: 'b1', machineId: 'm1', orderId: 'o1', releasedAt: null, source: 'SCHEDULED' as const,
    startsAt: new Date(at.getTime() - 8 * 60 * 60 * 1000), endsAt: new Date(at.getTime() - minutesAgo * 60 * 1000), ...over,
  });
  it('EXTEND when the booking ended 15 minutes before the log', () => {
    expect(decideMachineSync({ machineId: 'm1', orderId: 'o1', at }, [ended(15)])).toMatchObject({ kind: 'EXTEND', booking: { id: 'b1' } });
  });
  it('CREATE once the grace window has passed, for another order, or when released', () => {
    expect(decideMachineSync({ machineId: 'm1', orderId: 'o1', at }, [ended(LATE_ENTRY_GRACE_MS / 60000 + 1)]).kind).toBe('CREATE');
    expect(decideMachineSync({ machineId: 'm1', orderId: 'o2', at }, [ended(15)]).kind).toBe('CREATE');
    expect(decideMachineSync({ machineId: 'm1', orderId: 'o1', at }, [ended(15, { releasedAt: new Date() })]).kind).toBe('CREATE');
  });
  it('a covering booking still wins over a just-ended one', () => {
    const covering = { ...ended(0), id: 'b2', startsAt: new Date(at.getTime() - 60_000), endsAt: new Date(at.getTime() + 60_000) };
    expect(decideMachineSync({ machineId: 'm1', orderId: 'o1', at }, [ended(15), covering])).toMatchObject({ kind: 'COVERED', booking: { id: 'b2' } });
  });
});
