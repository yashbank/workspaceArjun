/**
 * Phase 24F · F-24 — the GRN list page opens for every role that may read receipts.
 *
 * Found in the browser: a Supervisor's nav listed "GRN" but the page said "You do not have access". The page called
 * `listPOs()` (needs `po.read`) unconditionally to fill the "New GRN" form, and the Supervisor holds `grn.read` but not
 * `po.read`. The real permission matrix is used here: only the databases and the session are faked.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const calls = { grns: 0, pos: 0 };
vi.mock('@/server/db', () => ({
  db: {
    misGrn: { findMany: async () => { calls.grns += 1; return [{ id: 'g1', grnNumber: 'GRN-1' }]; } },
    misPurchaseOrder: { findMany: async () => { calls.pos += 1; return [{ id: 'p1', poNumber: 'PO-1', status: 'APPROVED' }, { id: 'p2', poNumber: 'PO-2', status: 'DRAFT' }]; } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/components/mis/grn/grn-list-screen', () => ({ GrnListScreen: () => null }));

const { default: GrnPage } = await import('./page');

const propsOf = (node: ReactNode) => (isValidElement(node) ? (node.props as { grns: unknown[]; approvedPos: { id: string }[]; canWrite: boolean }) : null);
const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };
const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'];

beforeEach(() => {
  vi.clearAllMocks();
  calls.grns = 0; calls.pos = 0;
});

describe.each(MIS_ROLES.map((r) => [r] as const))('%s', (role) => {
  if (READERS.includes(role)) {
    it('opens the list', async () => {
      as(role);
      const p = propsOf(await GrnPage());
      expect(p?.grns).toHaveLength(1);
    });
  } else {
    it('is refused (no GRN read)', async () => {
      as(role);
      await expect(GrnPage()).rejects.toMatchObject({ name: 'MisForbiddenError' });
    });
  }
});

describe('the purchase orders behind the "New GRN" form', () => {
  it('a Supervisor (grn.read, no grn.write, no po.read) gets the list and no PO query at all', async () => {
    as('SUPERVISOR');
    const p = propsOf(await GrnPage());
    expect(p).toMatchObject({ canWrite: false, approvedPos: [] });
    expect(calls.pos).toBe(0);
  });

  it.each(['OWNER', 'ADMIN', 'STORE_GUY'] as const)('%s, who may write, gets the approved POs to choose from', async (role) => {
    as(role);
    const p = propsOf(await GrnPage());
    expect(p?.canWrite).toBe(true);
    expect(p?.approvedPos.map((x) => x.id)).toEqual(['p1']);
  });
});
