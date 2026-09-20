/**
 * The MIS permission matrix — one table, no scattered ifs.
 *
 * Pure and dependency-free so the same matrix answers both the server check
 * (server/mis/auth.ts, which throws) and the <Can> render helper, and the two
 * can never disagree. Only the *answer* is sent to the browser, never the table.
 */

import type { MisRoleName } from './roles';

export const MIS_ACTIONS = [
  'masters.read',
  'masters.write',
  'employees.read',
  'employees.write',
  'orders.read',
  'orders.write',
  'production.read',
  'production.write',
  'qc.read',
  'qc.write',
  'attendance.read',
  'attendance.write',
  'reports.read',
  'settings.read',
  'settings.write',
  // Money. Owner only, everywhere, always (S9).
  'wages.read',
  // AQL accept/reject thresholds. Owner only, same shape as wages.read: a
  // change here silently re-scores every QC sample going forward, so it is
  // not something Admin's general settings.write should reach.
  'aql.read',
  // MIS user management. Owner only — ADMIN may view via employees.read but
  // never invite or grant a role (MIS-11/E1-08). Viewing an existing
  // employee's role change still goes through employees.write, unchanged.
  'users.invite',
  // Inventory, PO, GRN
  'inventory.read',
  'inventory.write',
  'po.read',
  'po.write',
  'grn.read',
  'grn.write',
  // Store module (MIS-280+)
  'store.read',
  'store.write',
  'store.count',   // physical count — owner/admin only
  // Line clearance (D7, DECISIONS.md). Read is the history view; write is the
  // clear-line action itself — SUPERVISOR and above only.
  'clearance.read',
  'clearance.write',
  // Job phases and the handover gate (DEVELOPMENT_GUIDE.md Appendix A).
  // phase.reopen is its own action, Owner-only, because withdrawing a
  // signature is a different kind of act from moving a phase along.
  // Note: holding phase.write does NOT let you sign off someone else's phase —
  // the in-charge identity check in job-phases.ts sits on top of it (D12).
  'phase.read',
  'phase.write',
  'phase.reopen',
  // Gate tablets (D18): pair, rename and retire a device. Owner and Admin only.
  // Seeing kiosk health on the attendance home needs only attendance.read.
  'kiosk.manage',
] as const;

export type MisAction = (typeof MIS_ACTIONS)[number];

/**
 * role → the actions it may perform.
 *
 * A role absent from a row simply cannot do that thing. There is no inheritance
 * and no wildcard: every grant is written down, because a wildcard is how an
 * attendance operator quietly ends up able to read wages.
 */
const MATRIX: Record<MisRoleName, readonly MisAction[]> = {
  OWNER: MIS_ACTIONS,

  ADMIN: [
    'masters.read',
    'masters.write',
    'employees.read',
    'employees.write',
    'orders.read',
    'orders.write',
    'production.read',
    'production.write',
    'qc.read',
    'qc.write',
    'attendance.read',
    'attendance.write',
    'reports.read',
    'settings.read',
    'settings.write',
    'inventory.read',
    'inventory.write',
    'po.read',
    'po.write',
    'grn.read',
    'grn.write',
    'store.read',
    'store.write',
    'store.count',
    'clearance.read',
    'clearance.write',
    'phase.read',
    'phase.write',
    'kiosk.manage',
  ],

  SUPERVISOR: [
    'masters.read',
    'employees.read',
    'orders.read',
    'production.read',
    'production.write',
    'qc.read',
    'attendance.read',
    'reports.read',
    'inventory.read',
    'grn.read',
    'store.read',
    'clearance.read',
    'clearance.write',
    'phase.read',
    'phase.write',
  ],

  QC: ['masters.read', 'orders.read', 'production.read', 'qc.read', 'qc.write', 'reports.read', 'phase.read'],

  SUPER_ATTENDANCE_OPERATOR: [
    'employees.read',
    'attendance.read',
    'attendance.write',
    'reports.read',
  ],

  ATTENDANCE_OPERATOR: ['employees.read', 'attendance.read', 'attendance.write'],

  STORE_GUY: [
    'inventory.read',
    'grn.read',
    'grn.write',
    'po.read',
    'store.read',
    'store.write',
    'store.count',
  ],

  // A worker has no login at all. The row exists so the matrix is total.
  WORKER: [],
};

/** Does this role allow this action? A null role (no MIS record) allows nothing. */
export function can(role: MisRoleName | null | undefined, action: MisAction): boolean {
  if (!role) return false;
  return MATRIX[role].includes(action);
}

/** Every action this role may perform. Used to build a nav payload in one pass. */
export function allowedActions(role: MisRoleName | null | undefined): MisAction[] {
  if (!role) return [];
  return [...MATRIX[role]];
}
