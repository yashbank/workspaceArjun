/**
 * Phase 18 · MIS-267 — the attendance report and the payroll engine agree to the rupee.
 *
 * "That is the kind of disagreement nobody notices until the client notices" (the phase's own
 * note). Two independently written code paths read the SAME `misAttendance` rows for the same
 * month: `getAttendanceReport` (reports.ts, a count-only screen) and `calculateMonthlyPayroll`
 * (payroll.ts, the money engine). This asserts their counts for the same underlying data agree —
 * they should describe the same reality twice, not two different ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, seedWorld, state } from './testing/wage-world';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/db', () => ({ get db() { return fakeDb; } }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const { getAttendanceReport } = await import('./reports');
const { calculateMonthlyPayroll } = await import('./payroll');

const rec = (id: string, date: string, status: string, lateMinutes = 0, otMinutes = 0) => ({
  id, date: new Date(date), status, lateMinutes, otMinutes, employee: EMP, shift: { name: 'Day' },
});

const RANGE = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('MIS-267 — present-day counts must agree', () => {
  // F-39, fixed: `payroll.ts` counts a HALF_DAY as present (its own comment calls this "a
  // POLICY, not an attendance fact") and `getAttendanceReport` now applies the same policy,
  // instead of checking `status === 'PRESENT'` alone and silently dropping the half-day.
  it('a HALF_DAY counts as present on both sides, or on neither — not one and not the other', async () => {
    state.attendance = [rec('a1', '2026-01-05', 'PRESENT'), rec('a2', '2026-01-06', 'HALF_DAY')];

    const [payrollRow] = await calculateMonthlyPayroll(2026, 1);
    const report = await getAttendanceReport(RANGE);
    const reportRow = report.rows.find((r) => r.code === EMP.employeeCode)!;

    expect(reportRow.present).toBe(payrollRow.present); // payroll counts PRESENT+HALF_DAY = 2
  });

  // F-39, fixed: `getAttendanceReport`'s `late` counter now matches `attendance.ts`'s own
  // definition — `lateMinutes > 0 || status === 'LATE'` — instead of checking the literal status
  // string alone, which undercounted a day marked PRESENT with a real `lateMinutes` figure.
  it('a day with real lateMinutes but status PRESENT is counted late, matching attendance.ts\'s own definition', async () => {
    state.attendance = [rec('a1', '2026-01-05', 'PRESENT', 15)]; // 15 minutes late, status never changed
    const report = await getAttendanceReport(RANGE);
    const reportRow = report.rows.find((r) => r.code === EMP.employeeCode)!;
    expect(reportRow.late).toBe(1);
  });

  it('ordinary PRESENT days with no lateness or half-days already agree (the bug is specifically about HALF_DAY/late-without-status)', async () => {
    state.attendance = [rec('a1', '2026-01-05', 'PRESENT'), rec('a2', '2026-01-06', 'ABSENT')];
    const [payrollRow] = await calculateMonthlyPayroll(2026, 1);
    const report = await getAttendanceReport(RANGE);
    const reportRow = report.rows.find((r) => r.code === EMP.employeeCode)!;
    expect(reportRow.present).toBe(payrollRow.present);
    expect(reportRow.absent).toBe(payrollRow.absent);
  });
});
