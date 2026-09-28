export type MisRoleName =
  | 'OWNER'
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'QC'
  | 'SUPER_ATTENDANCE_OPERATOR'
  | 'ATTENDANCE_OPERATOR'
  | 'STORE_GUY';

export const ROLES: MisRoleName[] = [
  'OWNER',
  'ADMIN',
  'SUPERVISOR',
  'QC',
  'SUPER_ATTENDANCE_OPERATOR',
  'ATTENDANCE_OPERATOR',
  'STORE_GUY',
];

export function credentialsFor(role: MisRoleName): { email: string; password: string } {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error(`Missing E2E_${role}_EMAIL or E2E_PASSWORD in .env.e2e`);
  return { email, password };
}

export const storageStatePath = (role: MisRoleName) => `e2e/.auth/${role}.json`;

/**
 * The desktop sidebar's `/mis/<id>` hrefs each role should see, hand-written from
 * `src/server/mis/navigation.test.ts`'s own EXPECTED table (the single source of truth for the
 * permission-derived menu) so a menu regression is caught the same way here as it already is at
 * the unit level — this file is the "does the real rendered page agree" half of that check.
 */
const ALL = [
  'masters', 'orders', 'production', 'quality', 'attendance', 'machine-board', 'reports', 'settings', 'employees',
  'po', 'grn', 'inventory', 'customers', 'suppliers', 'documents', 'bom', 'traceability', 'approvals', 'queue', 'kiosk',
  'audit', 'payroll', 'store',
];

export const EXPECTED_NAV: Record<MisRoleName, string[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((id) => id !== 'payroll'),
  SUPERVISOR: ['masters', 'orders', 'production', 'quality', 'attendance', 'machine-board', 'reports', 'employees', 'grn', 'inventory', 'customers', 'documents', 'bom', 'traceability', 'store'],
  QC: ['masters', 'orders', 'production', 'quality', 'machine-board', 'reports', 'customers', 'documents', 'bom', 'traceability'],
  ATTENDANCE_OPERATOR: ['attendance', 'employees', 'kiosk'],
  SUPER_ATTENDANCE_OPERATOR: ['attendance', 'reports', 'employees', 'queue', 'kiosk'],
  STORE_GUY: ['po', 'grn', 'inventory', 'suppliers', 'store'],
};

/** Nav ids that must NEVER appear for a role — the exact bugs already found, kept explicit. */
export const MUST_NOT_SEE: Partial<Record<MisRoleName, string[]>> = {
  QC: ['approvals'], // F-13
  SUPERVISOR: ['approvals'], // F-13
};

/** The one nav id whose href isn't `/mis/<id>` — copied from navigation.ts's own NAV table. */
const HREF_OVERRIDE: Record<string, string> = { quality: '/mis/qc' };
export const hrefFor = (id: string) => HREF_OVERRIDE[id] ?? `/mis/${id}`;
