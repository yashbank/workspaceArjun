/**
 * Phase 28 — permission-gate coverage for `approveLeave`, which had none. Written after a live
 * manual test raised the concern that QC could approve an employee's leave; the visibility side
 * of that (QC seeing the pending leave in the Approvals inbox) was F-13, fixed separately by
 * gating that list behind approvals.read. This file checks the WRITE side directly: does calling
 * `approveLeave` itself actually deny every role but the ones the matrix grants attendance.write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const leave = { id: 'l1', employeeId: 'e1', date: new Date('2026-01-01'), status: 'PENDING' };
vi.mock('@/server/db', () => ({
  db: {
    misLeaveRequest: {
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...leave, ...data }),
    },
  },
}));

const { approveLeave } = await import('./attendance');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('approveLeave — only attendance.write holders may call it', () => {
  it.each(MIS_ROLES)('%s: allowed exactly when the role holds attendance.write', async (role: MisRoleName) => {
    getMisRole.mockResolvedValue(role);
    const call = approveLeave('l1', true);
    if (can(role, 'attendance.write')) {
      await expect(call).resolves.toMatchObject({ status: 'APPROVED' });
    } else {
      await expect(call).rejects.toThrow(/Not permitted: attendance\.write/);
    }
  });

  it('QC specifically cannot approve a leave request — the exact case a live manual test raised', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(approveLeave('l1', true)).rejects.toThrow(/Not permitted/);
  });

  it('SUPERVISOR (reads attendance, does not write it) cannot approve either', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(approveLeave('l1', true)).rejects.toThrow(/Not permitted/);
  });

  it('SUPER_ATTENDANCE_OPERATOR, ADMIN and OWNER can approve — the refusals above are the role, not a broken fixture', async () => {
    for (const role of ['SUPER_ATTENDANCE_OPERATOR', 'ADMIN', 'OWNER'] as MisRoleName[]) {
      getMisRole.mockResolvedValue(role);
      await expect(approveLeave('l1', true)).resolves.toMatchObject({ status: 'APPROVED' });
    }
  });

  it('a signed-out caller (no user) is refused, not silently allowed', async () => {
    getCurrentUser.mockResolvedValue(null);
    getMisRole.mockResolvedValue('OWNER');
    await expect(approveLeave('l1', true)).rejects.toThrow(/Not permitted/);
  });
});
