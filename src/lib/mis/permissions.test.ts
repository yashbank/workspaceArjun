import { describe, expect, it } from 'vitest';

import { MIS_ACTIONS, allowedActions, can } from './permissions';
import { MIS_ROLES } from './roles';

describe('permission matrix', () => {
  it('covers every role', () => {
    for (const role of MIS_ROLES) {
      expect(Array.isArray(allowedActions(role))).toBe(true);
    }
  });

  it('gives the owner everything', () => {
    for (const action of MIS_ACTIONS) {
      expect(can('OWNER', action), action).toBe(true);
    }
  });

  it('keeps wages owner-only — money never widens', () => {
    for (const role of MIS_ROLES) {
      expect(can(role, 'wages.read'), role).toBe(role === 'OWNER');
    }
  });

  it('does not let an admin read wages even though it can do everything else', () => {
    expect(can('ADMIN', 'settings.write')).toBe(true);
    expect(can('ADMIN', 'wages.read')).toBe(false);
  });

  it('keeps a QC user out of production writes', () => {
    expect(can('QC', 'qc.write')).toBe(true);
    expect(can('QC', 'production.write')).toBe(false);
  });

  it('keeps an attendance operator out of orders entirely', () => {
    expect(can('ATTENDANCE_OPERATOR', 'orders.read')).toBe(false);
    expect(can('ATTENDANCE_OPERATOR', 'attendance.write')).toBe(true);
  });

  it('gives a worker nothing — a worker has no login', () => {
    expect(allowedActions('WORKER')).toEqual([]);
  });

  it('gives a user with no MIS record nothing', () => {
    expect(can(null, 'masters.read')).toBe(false);
    expect(allowedActions(undefined)).toEqual([]);
  });

  it('lets only Owner and Admin pair or retire a gate tablet (D18)', () => {
    for (const role of MIS_ROLES) {
      expect(can(role, 'kiosk.manage'), role).toBe(role === 'OWNER' || role === 'ADMIN');
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 14 · MIS-37 / MIS-46 / MIS-52 — the whole matrix, written out
//
// permissions.ts is one table; this is a SECOND, hand-written copy of it. That is the point:
// widening a role now needs two deliberate edits, so it cannot happen as a side effect of
// touching one. Every role × every action is asserted (8 × 33), not just the interesting ones.
// ---------------------------------------------------------------------------
type Role = (typeof MIS_ROLES)[number];
type Action = (typeof MIS_ACTIONS)[number];

const ADMIN_GRANTS: Action[] = [
  'masters.read', 'masters.write', 'employees.read', 'employees.write', 'orders.read', 'orders.write',
  'production.read', 'production.write', 'qc.read', 'qc.write', 'attendance.read', 'attendance.write',
  'reports.read', 'settings.read', 'settings.write', 'inventory.read', 'inventory.write', 'po.read', 'po.write',
  'grn.read', 'grn.write', 'store.read', 'store.write', 'store.count', 'clearance.read', 'clearance.write',
  'phase.read', 'phase.write', 'kiosk.manage',
];

const EXPECTED: Record<Role, Action[]> = {
  OWNER: [...MIS_ACTIONS],
  ADMIN: ADMIN_GRANTS,
  SUPERVISOR: [
    'masters.read', 'employees.read', 'orders.read', 'production.read', 'production.write', 'qc.read',
    'attendance.read', 'reports.read', 'inventory.read', 'grn.read', 'store.read', 'clearance.read',
    'clearance.write', 'phase.read', 'phase.write',
  ],
  QC: ['masters.read', 'orders.read', 'production.read', 'qc.read', 'qc.write', 'reports.read', 'phase.read'],
  ATTENDANCE_OPERATOR: ['employees.read', 'attendance.read', 'attendance.write'],
  SUPER_ATTENDANCE_OPERATOR: ['employees.read', 'attendance.read', 'attendance.write', 'reports.read'],
  WORKER: [],
  STORE_GUY: ['inventory.read', 'grn.read', 'grn.write', 'po.read', 'store.read', 'store.write', 'store.count'],
};

describe('the full matrix — every role × every action, against a hand-written copy', () => {
  it('the copy names every action and every role exactly once (a new action cannot slip past unlisted)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...MIS_ROLES].sort());
    expect(MIS_ACTIONS.length).toBe(33);
    expect(new Set(MIS_ACTIONS).size).toBe(MIS_ACTIONS.length);
    for (const role of MIS_ROLES) {
      for (const a of EXPECTED[role]) expect(MIS_ACTIONS, `${role} lists unknown action ${a}`).toContain(a);
    }
  });

  it.each(MIS_ROLES)('%s holds exactly the actions written down for it — no more, no fewer', (role) => {
    const held = MIS_ACTIONS.filter((a) => can(role, a));
    expect(held.sort()).toEqual([...EXPECTED[role]].sort());
    expect(allowedActions(role).sort()).toEqual([...EXPECTED[role]].sort());
  });

  it.each(MIS_ROLES.flatMap((r) => MIS_ACTIONS.map((a) => [r, a] as const)))(
    '%s × %s',
    (role, action) => {
      expect(can(role, action)).toBe(EXPECTED[role].includes(action));
    },
  );
});

describe('the actions that only an OWNER may hold — and nothing else does', () => {
  const OWNER_ONLY: Action[] = ['wages.read', 'aql.read', 'users.invite', 'phase.reopen'];

  it.each(OWNER_ONLY)('%s is held by OWNER and by no other role', (action) => {
    const holders = MIS_ROLES.filter((r) => can(r, action));
    expect(holders).toEqual(['OWNER']);
  });

  it('the Owner-only set is exactly these four (a fifth needs a decision, and a line here)', () => {
    const ownerOnly = MIS_ACTIONS.filter((a) => MIS_ROLES.filter((r) => can(r, a)).length === 1);
    expect([...ownerOnly].sort()).toEqual([...OWNER_ONLY].sort());
  });

  it('D6 — aql.read is Owner-only and is NOT reachable through settings.read / settings.write', () => {
    expect(can('ADMIN', 'settings.read')).toBe(true);
    expect(can('ADMIN', 'settings.write')).toBe(true);
    expect(can('ADMIN', 'aql.read')).toBe(false);
  });

  it('a permission that has an OWNER-only twin is never handed out by "reports.read" or "attendance.read"', () => {
    // Payroll is computed from attendance and reported in reports: neither read grants money.
    for (const role of MIS_ROLES.filter((r) => r !== 'OWNER')) {
      if (can(role, 'attendance.read') || can(role, 'reports.read')) {
        expect(can(role, 'wages.read'), role).toBe(false);
      }
    }
  });
});

describe('MIS_UI_SPEC §4.5 — what each role is meant to reach', () => {
  it('a worker reaches nothing; the kiosk is a separate device', () => {
    expect(allowedActions('WORKER')).toEqual([]);
  });

  it('STORE_GUY never touches people, attendance, QC or orders', () => {
    for (const a of ['employees.read', 'attendance.read', 'attendance.write', 'qc.read', 'orders.read', 'production.read'] as const) {
      expect(can('STORE_GUY', a), a).toBe(false);
    }
  });

  it('QC never writes production, orders, attendance or the store', () => {
    for (const a of ['production.write', 'orders.write', 'attendance.write', 'store.write', 'grn.write'] as const) {
      expect(can('QC', a), a).toBe(false);
    }
  });

  it('SUPERVISOR reads attendance but cannot write it; ATTENDANCE_OPERATOR writes it', () => {
    expect(can('SUPERVISOR', 'attendance.read')).toBe(true);
    expect(can('SUPERVISOR', 'attendance.write')).toBe(false);
    expect(can('ATTENDANCE_OPERATOR', 'attendance.write')).toBe(true);
  });

  it('only Owner and Admin may edit settings; only they manage tablets (D18)', () => {
    for (const role of MIS_ROLES) {
      expect(can(role, 'settings.write'), role).toBe(role === 'OWNER' || role === 'ADMIN');
      expect(can(role, 'kiosk.manage'), role).toBe(role === 'OWNER' || role === 'ADMIN');
    }
  });

  it('SUPER_ATTENDANCE_OPERATOR = ATTENDANCE_OPERATOR + reports.read, and nothing else', () => {
    const extra = EXPECTED.SUPER_ATTENDANCE_OPERATOR.filter((a) => !EXPECTED.ATTENDANCE_OPERATOR.includes(a));
    expect(extra).toEqual(['reports.read']);
  });
});
