/**
 * Phase 28 — `approvePO`'s role gate, isolated from the approvalMode arithmetic that
 * `po-buffer-stock.test.ts` already covers (ADMIN_ONLY/OWNER_ONLY/BOTH). That file only ever
 * drives approvePO as ADMIN or OWNER; this file checks every OTHER role is refused before the
 * function ever reads the PO — `requirePermission('po.write')` is the very first line, so a role
 * without po.write never reaches the database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const po = { id: 'po1', status: 'PENDING_APPROVAL', approvalMode: 'ADMIN_ONLY', adminApprovedAt: null };
vi.mock('@/server/db', () => ({
  db: {
    misPurchaseOrder: {
      findUnique: async () => po,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ ...po, ...data }),
    },
  },
}));

const { approvePO } = await import('./po');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('approvePO — only po.write holders reach the function at all', () => {
  it.each(MIS_ROLES)('%s: allowed exactly when the role holds po.write', async (role: MisRoleName) => {
    getMisRole.mockResolvedValue(role);
    const call = approvePO('po1');
    if (can(role, 'po.write')) {
      await expect(call).resolves.toMatchObject({ status: 'APPROVED' });
    } else {
      await expect(call).rejects.toThrow(/Not permitted: po\.write/);
    }
  });

  it('STORE_GUY (po.read, not po.write) cannot approve a PO despite handling receipts', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(approvePO('po1')).rejects.toThrow(/Not permitted/);
  });

  it('QC and SUPERVISOR cannot approve a PO — neither holds po.write', async () => {
    for (const role of ['QC', 'SUPERVISOR'] as MisRoleName[]) {
      getMisRole.mockResolvedValue(role);
      await expect(approvePO('po1')).rejects.toThrow(/Not permitted/);
    }
  });
});
