/**
 * Phase 14 · MIS-49 (cross-role visibility), fixed post-launch (F-13) — the approvals list
 * gathers three kinds of thing (BOMs, leave requests, purchase orders, plus 25.4's extra-pay
 * days) behind ONE permission. Originally that permission was the broad orders.read, which let
 * QC/Supervisor see this Owner/Admin sign-off inbox as a side effect of holding order context —
 * the exact F-13 leak. The gate is now the dedicated approvals.read, held only by OWNER/ADMIN,
 * both of whom also hold every kind's own read permission, so the "returned without direct
 * read access" leak this file used to document no longer has a role to exercise it.
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
  it.each(MIS_ROLES)('%s: allowed exactly when the role holds approvals.read', async (role) => {
    as(role);
    const call = getPendingApprovals();
    // Phase 25 (D28): OWNER also holds wages.read, so the one seeded extra-pay day joins the
    // count for OWNER only — ADMIN (approvals.read but not wages.read) gets 3, the pre-25 figure.
    const expectedTotal = can(role, 'wages.read') ? 4 : 3;
    if (can(role, 'approvals.read')) await expect(call).resolves.toMatchObject({ total: expectedTotal });
    else await expect(call).rejects.toThrow(/Not permitted: approvals\.read/);
  });
});

describe('25.4/D28 — extra-pay days are folded in ONLY for a wages.read holder', () => {
  it('OWNER sees the pending extra-pay day', async () => {
    as('OWNER');
    const out = await getPendingApprovals();
    expect(out.extraPayDays).toHaveLength(1);
    expect(out.extraPayDays[0]).toMatchObject({ value: 999, kind: 'FLAT_AMOUNT' });
  });

  it.each(MIS_ROLES.filter((r) => can(r, 'approvals.read') && !can(r, 'wages.read')))(
    '%s (approvals.read but not wages.read) never sees it, not even redacted',
    async (role) => {
      as(role);
      const out = await getPendingApprovals();
      expect(out.extraPayDays).toEqual([]);
    },
  );
});

describe('F-13, closed — approvals.read is never granted without every kind\'s own read permission', () => {
  // The old leak: a role could hold the broad orders.read (enough to pass the gate) without
  // holding a given kind's own permission, and still receive that kind here. Restricting the
  // gate to approvals.read (OWNER/ADMIN only, both full-breadth roles) removes any role that
  // could exercise that gap — this asserts the gap is actually closed, not just narrowed.
  const KIND: { key: 'leaves' | 'pos'; needs: MisAction }[] = [
    { key: 'leaves', needs: 'attendance.read' },
    { key: 'pos', needs: 'po.read' },
  ];

  for (const { key, needs } of KIND) {
    it(`every approvals.read holder also holds ${needs} (no one can reach '${key}' without it)`, () => {
      const gap = MIS_ROLES.filter((r) => can(r, 'approvals.read') && !can(r, needs));
      expect(gap).toEqual([]);
    });
  }
});
