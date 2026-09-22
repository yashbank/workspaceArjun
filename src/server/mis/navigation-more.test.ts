/**
 * D32 (F-27) — the phone "More" list is the desktop sidebar's permission table, read for the phone.
 *
 * `navigationForRole(role, 'phone')` must list a screen for Owner / Admin / Supervisor if and only if
 * the role holds the permission that screen needs, and must be empty for every other role (they keep
 * their fixed tabs). REQUIRES below is written out by hand from each page's own gate, so an entry
 * cannot gain, lose or change a permission without an edit here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can, type MisAction } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { navigationForRole, getNavigationFor } = await import('./navigation');

/** Every screen the phone can list, and what its page needs (null: any signed-in MIS role). */
const REQUIRES: Record<string, MisAction | null> = {
  masters: 'masters.read',
  orders: 'orders.read',
  production: 'production.read',
  quality: 'qc.read',
  attendance: 'attendance.read',
  'machine-board': 'production.read',
  reports: 'reports.read',
  settings: 'settings.read',
  employees: 'employees.read',
  po: 'po.read',
  grn: 'grn.read',
  inventory: 'inventory.read',
  customers: 'orders.read',
  suppliers: 'po.read',
  documents: 'orders.read',
  bom: 'orders.read',
  traceability: 'orders.read',
  approvals: 'orders.read',
  kiosk: 'attendance.write',
  audit: 'settings.read',
  payroll: 'wages.read',
  store: 'store.read',
  crew: 'attendance.read',
  leave: 'attendance.read',
  'settings-users': 'settings.read',
  'settings-rules': 'wages.read',
  me: null,
};

const MORE_ROLES: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR'];
const FIXED_TAB_ROLES = MIS_ROLES.filter((r) => !MORE_ROLES.includes(r));

const idsFor = (role: MisRoleName | null) => navigationForRole(role, 'phone').map((e) => e.id);
const allowed = (role: MisRoleName) =>
  Object.entries(REQUIRES)
    .filter(([, need]) => (need === null ? true : can(role, need)))
    .map(([id]) => id)
    .sort();

beforeEach(() => vi.clearAllMocks());

describe('the phone More list — an item appears iff the role holds its permission', () => {
  it.each(MORE_ROLES)('%s: exactly the screens its permissions open', (role) => {
    expect([...idsFor(role)].sort()).toEqual(allowed(role));
  });

  it('every entry the phone can list is in the reviewed table (a new NAV row needs a REQUIRES row)', () => {
    for (const role of MORE_ROLES) {
      for (const id of idsFor(role)) expect(REQUIRES, id).toHaveProperty(id);
    }
  });

  it('an entry is never offered twice, and each carries a real /mis link', () => {
    for (const role of MORE_ROLES) {
      const list = navigationForRole(role, 'phone');
      expect(new Set(list.map((e) => e.id)).size).toBe(list.length);
      for (const e of list) expect(e.href).toMatch(/^\/mis(\/|$)/);
    }
  });

  it.each(FIXED_TAB_ROLES)('%s keeps its fixed tabs: no More list at all', (role) => {
    expect(navigationForRole(role, 'phone')).toEqual([]);
  });

  it('a login with no MIS role gets nothing', () => {
    expect(navigationForRole(null, 'phone')).toEqual([]);
  });
});

describe('what each of the three roles can reach', () => {
  it('OWNER: Settings, Store, GRN, PO, Inventory and Suppliers (and the Owner-only rules and payroll)', () => {
    const ids = idsFor('OWNER');
    for (const id of ['settings', 'store', 'grn', 'po', 'inventory', 'suppliers', 'settings-rules', 'payroll', 'audit', 'me']) {
      expect(ids).toContain(id);
    }
  });

  it('ADMIN: Reports (the tab More replaces), Store and PO — but neither Payroll nor the Owner-only rules', () => {
    const ids = idsFor('ADMIN');
    for (const id of ['reports', 'store', 'po', 'settings', 'settings-users']) expect(ids).toContain(id);
    expect(ids).not.toContain('payroll');
    expect(ids).not.toContain('settings-rules');
  });

  it('SUPERVISOR: Me (the tab More replaces) and only what the table allows, per permissions.ts', () => {
    const ids = idsFor('SUPERVISOR');
    // Held: masters, employees, orders, production, qc, attendance.read, reports, inventory, grn, store.
    for (const id of ['me', 'store', 'grn', 'inventory', 'reports', 'crew', 'leave', 'orders', 'quality']) {
      expect(ids).toContain(id);
    }
    // Not held: po.read, settings.read, attendance.write, wages.read.
    for (const id of ['po', 'suppliers', 'settings', 'settings-users', 'settings-rules', 'audit', 'kiosk', 'payroll']) {
      expect(ids).not.toContain(id);
    }
  });

  it('no role but Owner is ever offered a wage screen', () => {
    for (const role of MIS_ROLES.filter((r) => r !== 'OWNER')) {
      const ids = idsFor(role);
      expect(ids, role).not.toContain('payroll');
      expect(ids, role).not.toContain('settings-rules');
    }
  });
});

describe('phone and desktop read one table, so they cannot disagree', () => {
  it.each(MORE_ROLES)('%s: every desktop sidebar entry is on the phone, with the same link', async (role) => {
    getMisRole.mockResolvedValue(role);
    const desktop = await getNavigationFor('u');
    const phone = new Map(navigationForRole(role, 'phone').map((e) => [e.id, e]));
    for (const entry of desktop) {
      expect(phone.get(entry.id), `${role}: ${entry.id} missing on the phone`).toEqual(entry);
    }
  });

  it.each(MORE_ROLES)('%s: what the phone adds is only the phone-only screens', async (role) => {
    getMisRole.mockResolvedValue(role);
    const desktopIds = new Set((await getNavigationFor('u')).map((e) => e.id));
    const extra = idsFor(role).filter((id) => !desktopIds.has(id)).sort();
    expect(extra.every((id) => ['crew', 'leave', 'settings-users', 'settings-rules', 'me'].includes(id))).toBe(true);
  });

  it('the phone-only screens never leak into the desktop sidebar', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const ids = (await getNavigationFor('u')).map((e) => e.id);
    for (const id of ['crew', 'leave', 'settings-users', 'settings-rules', 'me']) expect(ids).not.toContain(id);
  });

  it('entries carry labels and links only — never the required permission', () => {
    for (const e of navigationForRole('OWNER', 'phone')) {
      expect(Object.keys(e).sort()).toEqual(['href', 'icon', 'id', 'labelKey', 'primary']);
    }
  });
});
