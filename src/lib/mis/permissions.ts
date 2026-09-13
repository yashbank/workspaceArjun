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
  ],

  QC: ['masters.read', 'orders.read', 'production.read', 'qc.read', 'qc.write', 'reports.read'],

  SUPER_ATTENDANCE_OPERATOR: [
    'employees.read',
    'attendance.read',
    'attendance.write',
    'reports.read',
  ],

  ATTENDANCE_OPERATOR: ['employees.read', 'attendance.read', 'attendance.write'],

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
