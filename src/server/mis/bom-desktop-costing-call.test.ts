/**
 * Phase 24C · D6 — the view does not even ASK for costing on behalf of a role that may not see it.
 *
 * `getBomCosting` gates itself, so a view that forgot its own `canCost` check would still be
 * refused for a non-Owner — and `bom-desktop.test.ts` could not tell (the payload is the same
 * either way). Two independent checks are what D24 wants ("not in the response" should not rest on
 * one line), so this file pins the FIRST one: the view never calls `getBomCosting` for anyone but
 * an Owner, and never when the Owner switches costing off.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { bom: Row | null; order: Row | null } = { bom: null, order: null };

vi.mock('@/server/db', () => ({
  db: {
    misBom: { findUnique: async () => world.bom },
    misOrder: { findUnique: async () => world.order },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const costingSpy = vi.fn();
vi.mock('./bom', async () => {
  const actual = await vi.importActual<typeof import('./bom')>('./bom');
  return {
    ...actual,
    getBomCosting: (...a: Parameters<typeof actual.getBomCosting>) => {
      costingSpy(...a);
      return actual.getBomCosting(...a);
    },
  };
});

const { getBomDesktopView } = await import('./bom-desktop');

const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  vi.clearAllMocks();
  world.order = { id: 'o1', orderNumber: 'ORD-1', description: null, status: 'IN_PROGRESS', customer: null };
  world.bom = {
    id: 'b1', orderId: 'o1', status: 'DRAFT', approvedAt: null,
    stages: [{ id: 's1', stageName: 'Print', seq: 0, process: null, materials: [
      { id: 'm1', description: 'Board', quantity: 10, unit: 'Kg', ratePerUnit: 100, seq: 0, item: null },
    ] }],
  };
});

describe('getBomDesktopView only asks for costing when it may be shown', () => {
  it.each(MIS_ROLES.filter((r) => r !== 'OWNER' && ['ADMIN', 'SUPERVISOR', 'QC'].includes(r)))(
    '%s asking for costing never reaches getBomCosting',
    async (role) => {
      as(role);
      await getBomDesktopView('o1', { costing: true });
      expect(costingSpy).not.toHaveBeenCalled();
    },
  );

  it('the OWNER asking for costing does', async () => {
    as('OWNER');
    await getBomDesktopView('o1', { costing: true });
    expect(costingSpy).toHaveBeenCalledTimes(1);
  });

  it('the OWNER switching costing off does not — the column is really dropped, not hidden', async () => {
    as('OWNER');
    await getBomDesktopView('o1', { costing: false });
    expect(costingSpy).not.toHaveBeenCalled();
  });
});
