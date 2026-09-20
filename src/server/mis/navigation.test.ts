/**
 * Phase 14 · MIS-40 — the permission-derived navigation list (`getNavigationFor`), which feeds
 * the desktop/overflow menu. (The five-tab phone bar is a fixed per-role set with its own test,
 * `components/mis/home/bottom-nav.test.tsx`.)
 *
 * The expected list per role is written out by hand from each entry's `requires` action, so a
 * menu entry cannot appear for a role — or vanish from one — without an edit here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getNavigationFor, splitNavigation, MAX_PRIMARY_NAV } = await import('./navigation');

const ALL = [
  'masters', 'orders', 'production', 'quality', 'attendance', 'machine-board', 'reports', 'settings', 'employees',
  'po', 'grn', 'inventory', 'customers', 'suppliers', 'documents', 'bom', 'traceability', 'approvals', 'kiosk',
  'audit', 'payroll', 'store',
];

const EXPECTED: Record<MisRoleName, string[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((id) => id !== 'payroll'), // Payroll is a wage screen: Owner only (F-01, D24)
  SUPERVISOR: ['masters', 'orders', 'production', 'quality', 'attendance', 'machine-board', 'reports', 'employees', 'grn', 'inventory', 'customers', 'documents', 'bom', 'traceability', 'approvals', 'store'],
  QC: ['masters', 'orders', 'production', 'quality', 'machine-board', 'reports', 'customers', 'documents', 'bom', 'traceability', 'approvals'],
  ATTENDANCE_OPERATOR: ['attendance', 'employees', 'kiosk'],
  SUPER_ATTENDANCE_OPERATOR: ['attendance', 'reports', 'employees', 'kiosk'],
  STORE_GUY: ['po', 'grn', 'inventory', 'suppliers', 'store'],
  WORKER: [],
};

beforeEach(() => vi.clearAllMocks());

describe('getNavigationFor — per role, exactly', () => {
  it.each(MIS_ROLES)('%s', async (role) => {
    getMisRole.mockResolvedValue(role);
    expect((await getNavigationFor('u')).map((e) => e.id)).toEqual(EXPECTED[role]);
  });

  it('a login with no MIS role gets an empty menu, not a default one', async () => {
    getMisRole.mockResolvedValue(null);
    expect(await getNavigationFor('u')).toEqual([]);
  });

  it('the required permission never reaches the browser — entries carry labels and links only', async () => {
    getMisRole.mockResolvedValue('OWNER');
    for (const e of await getNavigationFor('u')) expect(Object.keys(e).sort()).toEqual(['href', 'icon', 'id', 'labelKey', 'primary']);
  });

  it('every entry is absent, never greyed: a role that cannot open a page is not offered its link', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    const hrefs = (await getNavigationFor('u')).map((e) => e.href);
    for (const forbidden of ['/mis/orders', '/mis/attendance', '/mis/settings', '/mis/audit', '/mis/payroll', '/mis/employees']) {
      expect(hrefs).not.toContain(forbidden);
    }
  });
});

describe('splitNavigation', () => {
  it('the bottom bar never holds more than five, whoever is asking', async () => {
    for (const role of MIS_ROLES) {
      getMisRole.mockResolvedValue(role);
      const { primary, overflow } = splitNavigation(await getNavigationFor('u'));
      expect(primary.length).toBeLessThanOrEqual(MAX_PRIMARY_NAV);
      expect(primary.length + overflow.length).toBe(EXPECTED[role].length);
    }
  });
});

describe('F-01 (fixed in 14F) — the menu offers Payroll only to a role that holds wages.read', () => {
  it('only a role that holds wages.read is offered the Payroll link', async () => {
    for (const role of MIS_ROLES) {
      getMisRole.mockResolvedValue(role);
      const offered = (await getNavigationFor('u')).some((e) => e.id === 'payroll');
      expect(offered, role).toBe(role === 'OWNER');
    }
  });
});
