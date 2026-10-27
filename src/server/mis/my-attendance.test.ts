/** R2-172 — own attendance only: identity from the login, month rows summarised, no money. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { summariseMyMonth } from '@/lib/mis/my-attendance';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const empFind = vi.fn();
const attFind = vi.fn();
vi.mock('@/server/db', () => ({ db: { misEmployee: { findUnique: (...a: unknown[]) => empFind(...a) }, misAttendance: { findMany: (...a: unknown[]) => attFind(...a) } } }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const { getMyAttendanceMonth } = await import('./my-attendance');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T06:00:00Z'));
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  empFind.mockResolvedValue({ id: 'e1', name: 'Ramesh', isActive: true, deletedAt: null });
  attFind.mockResolvedValue([
    { date: new Date('2026-10-01T00:00:00Z'), status: 'PRESENT', clockIn: null, clockOut: null, lateMinutes: 10, otMinutes: 60 },
    { date: new Date('2026-10-02T00:00:00Z'), status: 'HALF_DAY', clockIn: null, clockOut: null, lateMinutes: 0, otMinutes: 0 },
  ]);
});

describe('getMyAttendanceMonth', () => {
  it('looks up the employee by the login and reads only that employee\'s rows for the current month', async () => {
    const out = await getMyAttendanceMonth();
    expect(empFind.mock.calls[0][0].where).toEqual({ userProfileId: 'u1' });
    expect(attFind.mock.calls[0][0].where.employeeId).toBe('e1');
    expect(out.monthKey).toBe('2026-10');
    expect(out.summary).toEqual({ daysWorked: 1.5, absent: 0, leave: 0, lateMinutes: 10, otMinutes: 60 });
  });

  it('a future month is clamped to the current one; a signed-out caller or one with no employee row is refused', async () => {
    expect((await getMyAttendanceMonth('2027-05')).monthKey).toBe('2026-10');
    getCurrentUser.mockResolvedValue(null);
    await expect(getMyAttendanceMonth()).rejects.toThrow(/Not permitted/);
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    empFind.mockResolvedValue(null);
    await expect(getMyAttendanceMonth()).rejects.toThrow(/Not permitted/);
  });
});

describe('summariseMyMonth', () => {
  it('counts present 1, half-day 0.5, absent and leave separately', () => {
    const d = (status: string) => ({ dateKey: 'x', status, clockIn: null, clockOut: null, lateMinutes: 0, otMinutes: 0 });
    expect(summariseMyMonth([d('PRESENT'), d('HALF_DAY'), d('ABSENT'), d('LEAVE')])).toMatchObject({ daysWorked: 1.5, absent: 1, leave: 1 });
  });
});
