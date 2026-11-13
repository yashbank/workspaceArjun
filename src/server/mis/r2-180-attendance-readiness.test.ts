import { beforeEach, describe, expect, it, vi } from 'vitest';

// R2-180: Admin sees the attendance half of month-end; wages stay Owner-only.
const getCurrentUser = vi.fn();
const getMisRole = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a), getMisEmployee: vi.fn() }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/payroll', () => ({ calculateMonthlyPayroll: vi.fn() }));

const count = vi.fn();
const findMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misAttendance: { count: (...a: unknown[]) => count(...a), findMany: (...a: unknown[]) => findMany(...a) },
    misLeaveRequest: { count: () => Promise.resolve(2) },
  },
}));

const { getAttendanceReadiness, getPayrollPreflight } = await import('./payroll-period');

const login = (role: string) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(0);
  findMany.mockResolvedValue([
    { employeeId: 'e1', status: 'PRESENT', employee: { name: 'Asha', employeeCode: 'E1' } },
    { employeeId: 'e1', status: 'HALF_DAY', employee: { name: 'Asha', employeeCode: 'E1' } },
    { employeeId: 'e1', status: 'ABSENT', employee: { name: 'Asha', employeeCode: 'E1' } },
    { employeeId: 'e1', status: 'LEAVE', employee: { name: 'Asha', employeeCode: 'E1' } },
  ]);
});

describe('R2-180 getAttendanceReadiness', () => {
  it('Admin gets checks and counts, with no pay-code item and no money keys', async () => {
    login('ADMIN');
    const out = await getAttendanceReadiness(2026, 10);
    expect(out.checks.map((c) => c.id)).toEqual(['clock-outs', 'open-leave']);
    expect(out.checks[1]).toMatchObject({ ok: false, detail: '2 pending' });
    expect(out.rows).toEqual([{ employeeId: 'e1', employeeName: 'Asha', employeeCode: 'E1', present: 2, halfDay: 1, absent: 1, leave: 1 }]);
    expect(JSON.stringify(out)).not.toMatch(/wage|rate|amount|pay-code/i);
  });

  it.each(['ATTENDANCE_OPERATOR', 'SUPERVISOR', 'WORKER'])('%s is refused', async (role) => {
    login(role);
    await expect(getAttendanceReadiness(2026, 10)).rejects.toThrow();
  });

  it('the wage-side preflight is still Owner-only (Admin refused)', async () => {
    login('ADMIN');
    await expect(getPayrollPreflight(2026, 10)).rejects.toThrow();
  });
});
