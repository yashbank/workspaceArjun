/**
 * Phase 14 · MIS-49 (cross-role visibility) — the approvals list is one call that gathers
 * three kinds of thing (BOMs, leave requests, purchase orders) behind ONE permission,
 * orders.read. Each kind has its own read permission in the matrix, so a role that may not
 * read leave requests or POs directly can still receive them here (F-13).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can, type MisAction } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

vi.mock('@/server/db', () => ({
  db: {
    misBom: { findMany: async () => [{ id: 'b1', status: 'PENDING_APPROVAL', order: { id: 'o1', orderNumber: 'ORD-1', description: 'x' } }] },
    misLeaveRequest: { findMany: async () => [{ id: 'l1', status: 'PENDING', employee: { name: 'Asha', employeeCode: 'E-001' } }] },
    misPurchaseOrder: { findMany: async () => [{ id: 'p1', status: 'PENDING_APPROVAL', supplier: { name: 'Acme' } }] },
    // Phase 25 (25.4, D28) — one pending extra-pay day, a rupee figure (₹999). Present so the
    // wages.read gate below is actually exercised, not merely accidentally satisfied because the
    // key was missing and getPendingApprovals()'s own .catch(() => []) swallowed a TypeError.
    misExtraPayDay: { findMany: async () => [{ id: 'x1', date: new Date('2026-01-01'), kind: 'FLAT_AMOUNT', value: 999, scope: 'ALL_PRESENT', reason: 'Diwali', status: 'PENDING', proposedById: 'u9', approvedById: null, approvedAt: null }] },
    misExtraPayDayEmployee: { findMany: async () => [] },
    misExtraPayDayDepartment: { findMany: async () => [] },
  },
}));

const { getPendingApprovals } = await import('./approvals');

beforeEach(() => vi.clearAllMocks());
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

describe('who may call it', () => {
  it.each(MIS_ROLES)('%s: allowed exactly when the role holds orders.read', async (role) => {
    as(role);
    const call = getPendingApprovals();
    // Phase 25 (D28): OWNER also holds wages.read, so the one seeded extra-pay day joins the
    // count for OWNER only — every other orders.read role gets 3, the pre-25 figure.
    const expectedTotal = can(role, 'wages.read') ? 4 : 3;
    if (can(role, 'orders.read')) await expect(call).resolves.toMatchObject({ total: expectedTotal });
    else await expect(call).rejects.toThrow(/Not permitted: orders\.read/);
  });
});

describe('25.4/D28 — extra-pay days are folded in ONLY for a wages.read holder', () => {
  it('OWNER sees the pending extra-pay day', async () => {
    as('OWNER');
    const out = await getPendingApprovals();
    expect(out.extraPayDays).toHaveLength(1);
    expect(out.extraPayDays[0]).toMatchObject({ value: 999, kind: 'FLAT_AMOUNT' });
  });

  it.each(MIS_ROLES.filter((r) => can(r, 'orders.read') && !can(r, 'wages.read')))(
    '%s (orders.read but not wages.read) never sees it, not even redacted',
    async (role) => {
      as(role);
      const out = await getPendingApprovals();
      expect(out.extraPayDays).toEqual([]);
    },
  );
});

describe('F-13 — each kind is returned to a role that cannot read it directly', () => {
  const KIND: { key: 'leaves' | 'pos'; needs: MisAction }[] = [
    { key: 'leaves', needs: 'attendance.read' },
    { key: 'pos', needs: 'po.read' },
  ];

  for (const { key, needs } of KIND) {
    // Roles that hold orders.read (so they get past the gate) but not the kind's own permission.
    const missing = MIS_ROLES.filter((r) => can(r, 'orders.read') && !can(r, needs));
    it(`the matrix leaves someone without ${needs} but with orders.read (else this section tests nothing)`, () => {
      expect(missing.length).toBeGreaterThan(0);
    });
    for (const role of missing) {
      it.fails(`${role} (no ${needs}) receives no '${key}' from the approvals list`, async () => {
        as(role);
        const out = await getPendingApprovals();
        expect(out[key]).toEqual([]);
      });
    }
  }
});
