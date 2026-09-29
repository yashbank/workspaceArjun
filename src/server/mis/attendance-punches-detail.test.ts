/**
 * `listPunchesForDay` (K9): the punch detail view behind the Attendance screen's
 * new "Punches" button, added so the Android kiosk's operator sign-in
 * (docs/KIOSK_OPERATOR_SIGNIN_2026-09-29.md) is actually visible to someone.
 *
 * The tricky part isn't the operator lookup — it's that there's no stored link
 * from a day row back to "its" punches (the day is DERIVED from punches,
 * attendance-day.ts), so a naive same-calendar-day query would silently miss a
 * wrapping night shift's early-morning punches, the exact bug just fixed on the
 * kiosk screen's own counts. These tests pin down that a punch bucketed onto the
 * PREVIOUS work-date by `deriveDays` shows up when asked for that previous date,
 * and only that date.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const NIGHT_SHIFT = { id: 'sh-night', startTime: '22:00', endTime: '06:00' };
const punches = [
  // 2026-09-15T19:00:00Z = 2026-09-16 00:30 IST — the night shift's small hours,
  // so deriveDays attributes it to 2026-09-15 (the day the shift STARTED), not 09-16.
  { id: 'p1', employeeId: 'e1', direction: 'IN', punchedAt: new Date('2026-09-15T19:00:00Z'), shiftId: 'sh-night', operatorId: 'op1', fromRevokedDevice: false, deviceId: 'd1' },
];
const employees = [{ id: 'op1', name: 'Amit Operator' }];

vi.mock('@/server/db', () => ({
  db: {
    misShift: { findMany: async () => [NIGHT_SHIFT] },
    misAttendancePunch: {
      findMany: async ({ where }: { where: { punchedAt: { gte: Date; lt: Date } } }) =>
        punches
          .filter((p) => p.punchedAt >= where.punchedAt.gte && p.punchedAt < where.punchedAt.lt)
          .map((p) => ({ ...p, device: { name: 'Gate-01' } })),
    },
    misEmployee: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        employees.filter((e) => where.id.in.includes(e.id)),
    },
  },
}));

const { listPunchesForDay } = await import('./attendance');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('listPunchesForDay', () => {
  it("a night shift's small-hours punch shows up on the day the shift STARTED, with its operator resolved", async () => {
    const rows = await listPunchesForDay('e1', '2026-09-15');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: 'IN', deviceName: 'Gate-01', operatorName: 'Amit Operator' });
  });

  it('the same punch does NOT show up on the calendar day it physically happened on', async () => {
    const rows = await listPunchesForDay('e1', '2026-09-16');
    expect(rows).toHaveLength(0);
  });

  it('no operatorId (portal punch, or from before this feature) shows no operator, not a crash', async () => {
    punches.push({ id: 'p2', employeeId: 'e1', direction: 'OUT', punchedAt: new Date('2026-09-15T20:00:00Z'), shiftId: 'sh-night', operatorId: null as unknown as string, fromRevokedDevice: false, deviceId: null as unknown as string });
    const rows = await listPunchesForDay('e1', '2026-09-15');
    const out = rows.find((r) => r.direction === 'OUT');
    expect(out?.operatorName).toBeNull();
  });

  it('every role may call it exactly when it holds attendance.read', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(listPunchesForDay('e1', '2026-09-15')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
