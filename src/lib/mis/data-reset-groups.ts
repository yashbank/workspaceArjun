/**
 * Owner Danger Zone — which data can be cleared, and in what order.
 *
 * Pure and dependency-free (no Prisma, no React) so the same list drives the screen, the server and the tests.
 *
 * What is NEVER offered for deletion (kept on purpose):
 *   - Sign-in accounts, roles and the Owner/Admin employee rows (deleting them would lock the Owner out).
 *   - The audit log (it records the reset itself).
 *   - Settings and masters: business rules, wage types, shifts, departments, machines, processes, defect types,
 *     QC templates, master options, paired gate tablets.
 *
 * Every table listed here is deleted inside ONE database transaction. If the database refuses any step (for example a
 * row somewhere still points at the data), the whole thing rolls back and nothing is deleted.
 */

export const CONFIRM_DELETE_WORD = 'DELETE';
export const CONFIRM_RESTORE_WORD = 'RESTORE';
/** A delete needs a backup taken within this window. */
export const BACKUP_MAX_AGE_MS = 60 * 60 * 1000;

export type ResetGroupId =
  | 'customers'
  | 'orders'
  | 'purchasing'
  | 'inventory'
  | 'attendance'
  | 'finance'
  | 'employees';

export type ResetGroup = {
  id: ResetGroupId;
  label: string;
  description: string;
  /** Tables whose rows are removed. Order here does not matter; the server sorts by foreign keys. */
  tables: readonly string[];
  /** Other groups that must be cleared with this one, because their rows point at this group's rows. */
  requires: readonly ResetGroupId[];
};

export const RESET_GROUPS: readonly ResetGroup[] = [
  {
    id: 'customers',
    label: 'Customers',
    description: 'The customer list. Orders stay, but lose their customer link.',
    tables: ['mis_customers'],
    requires: [],
  },
  {
    id: 'orders',
    label: 'Orders and production',
    description: 'Orders, bills of materials, production logs, QC checks, job phases and order documents.',
    tables: ['mis_order_stock_allocations', 'mis_qc_checks', 'mis_production_log', 'mis_bom', 'mis_orders'],
    requires: [],
  },
  {
    id: 'purchasing',
    label: 'Purchasing',
    description: 'Suppliers, purchase orders, goods received notes and supplier invoices.',
    tables: [
      'mis_supplier_invoices',
      'mis_quarantine_stock',
      'mis_grn_items',
      'mis_grns',
      'mis_po_items',
      'mis_purchase_orders',
      'mis_suppliers',
    ],
    requires: [],
  },
  {
    id: 'inventory',
    label: 'Inventory and store',
    description: 'Items, stock ledger, store transactions, material requests, pick lists, returns and counts.',
    tables: [
      'mis_store_returns',
      'mis_store_transactions',
      'mis_pick_list_lines',
      'mis_pick_lists',
      'mis_material_request_lines',
      'mis_material_requests',
      'mis_physical_counts',
      'mis_inventory_ledger',
      'mis_order_stock_allocations',
      'mis_quarantine_stock',
      'mis_items',
    ],
    requires: [],
  },
  {
    id: 'attendance',
    label: 'Attendance and leave',
    description: 'Attendance records, gate punches, breaks, leave requests, rosters, shift handovers and parked writes.',
    tables: [
      'mis_attendance_breaks',
      'mis_punch_regularizations',
      'mis_attendance_punches',
      'mis_attendance',
      'mis_leave_requests',
      'mis_shift_roster',
      'mis_shift_handovers',
      'mis_queued_writes',
    ],
    requires: [],
  },
  {
    id: 'finance',
    label: 'Finance and payroll',
    description: 'Payroll periods and snapshots, payslip releases, salary advances, extra pay days and pay components.',
    tables: [
      'mis_payroll_snapshot_lines',
      'mis_payroll_periods',
      'mis_payslip_releases',
      'mis_salary_advances',
      'mis_extra_pay_day_departments',
      'mis_extra_pay_day_employees',
      'mis_extra_pay_days',
      'mis_employee_pay_components',
    ],
    requires: [],
  },
  {
    id: 'employees',
    label: 'Employees (workers and staff)',
    description:
      'Employee records without a sign-in. Owner, Admin and every person who can sign in are kept. Also clears attendance and finance, which depend on employees.',
    tables: ['mis_worker_allocations', 'mis_employees'],
    requires: ['attendance', 'finance'],
  },
] as const;

export function isResetGroupId(value: unknown): value is ResetGroupId {
  return typeof value === 'string' && RESET_GROUPS.some((g) => g.id === value);
}

/** The groups asked for plus everything they require, without duplicates, in the order shown on screen. */
export function expandGroups(ids: readonly ResetGroupId[]): ResetGroupId[] {
  const wanted = new Set<ResetGroupId>();
  const visit = (id: ResetGroupId) => {
    if (wanted.has(id)) return;
    wanted.add(id);
    const group = RESET_GROUPS.find((g) => g.id === id);
    for (const dep of group?.requires ?? []) visit(dep);
  };
  ids.forEach(visit);
  return RESET_GROUPS.map((g) => g.id).filter((id) => wanted.has(id));
}

/** Every table touched by these groups (a table shared by two groups appears once). */
export function tablesForGroups(ids: readonly ResetGroupId[]): string[] {
  const tables = new Set<string>();
  for (const id of expandGroups(ids)) {
    const group = RESET_GROUPS.find((g) => g.id === id);
    group?.tables.forEach((t) => tables.add(t));
  }
  return [...tables];
}

/**
 * Tables copied into a backup and put back by a restore: all MIS data tables, except the ones below.
 * Kept out on purpose: the audit log (it must survive a restore) and paired gate tablets (a restore must not unpair them).
 */
export const BACKUP_EXCLUDED_TABLES: readonly string[] = ['mis_audit_logs', 'mis_kiosk_devices'];

/**
 * Tables a clear must never touch, even when a foreign key would pull them in. If the server's dependency walk
 * reaches one of these (or any table that is not mis_*), the clear is refused and nothing is deleted.
 */
export const PROTECTED_TABLES: readonly string[] = [
  ...BACKUP_EXCLUDED_TABLES,
  'mis_business_rules',
  'mis_departments',
  'mis_shifts',
  'mis_wage_types',
  'mis_machines',
  'mis_processes',
  'mis_defect_types',
  'mis_qc_templates',
  'mis_master_options',
  'mis_leave_pay_rules',
  'mis_dashboard_widgets',
  'mis_user_preferences',
];

/** Rows of mis_employees that a delete must never touch: anyone who can sign in, and every Owner/Admin. */
export const EMPLOYEE_KEEP_WHERE = `user_profile_id IS NULL AND role::text NOT IN ('OWNER', 'ADMIN')`;

/** Table names are interpolated into SQL, so only plain lowercase mis_ names are ever accepted. */
export function isSafeTableName(name: string): boolean {
  return /^mis_[a-z0-9_]+$/.test(name);
}

export type FkEdge = { child: string; parent: string };

/**
 * Parents first. Self-references and links to tables outside the set are ignored.
 * Throws if two tables point at each other, because then no safe order exists.
 */
export function orderParentsFirst(tables: readonly string[], edges: readonly FkEdge[]): string[] {
  const inSet = new Set(tables);
  const parentsOf = new Map<string, Set<string>>();
  for (const t of tables) parentsOf.set(t, new Set());
  for (const e of edges) {
    if (e.child === e.parent) continue;
    if (!inSet.has(e.child) || !inSet.has(e.parent)) continue;
    parentsOf.get(e.child)!.add(e.parent);
  }
  const ordered: string[] = [];
  const done = new Set<string>();
  const temp = new Set<string>();
  const visit = (t: string) => {
    if (done.has(t)) return;
    if (temp.has(t)) throw new Error(`Tables point at each other around ${t}; no safe order.`);
    temp.add(t);
    for (const p of [...parentsOf.get(t)!].sort()) visit(p);
    temp.delete(t);
    done.add(t);
    ordered.push(t);
  };
  [...tables].sort().forEach(visit);
  return ordered;
}

export type BackupFile = {
  format: 'mis-backup-v1';
  id: string;
  createdAt: string;
  tables: Record<string, unknown[]>;
};

export function countRows(tables: Record<string, unknown[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));
}

export function totalRows(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export type BackupCheck = { ok: true } | { ok: false; reason: string };

/**
 * May a delete of `tables` go ahead against this backup?
 *   - the backup must be recent;
 *   - no selected table may hold MORE rows now than when the backup was taken (rows added since would not be in it).
 */
export function checkBackupCoversDelete(args: {
  backupCreatedAt: Date;
  now: Date;
  backupCounts: Record<string, number>;
  currentCounts: Record<string, number>;
  tables: readonly string[];
}): BackupCheck {
  const age = args.now.getTime() - args.backupCreatedAt.getTime();
  if (age > BACKUP_MAX_AGE_MS) return { ok: false, reason: 'That backup is more than an hour old. Take a fresh backup first.' };
  if (age < 0) return { ok: false, reason: 'That backup has a date in the future. Take a fresh backup.' };
  for (const t of args.tables) {
    const now = args.currentCounts[t] ?? 0;
    const then = args.backupCounts[t] ?? 0;
    if (now > then) {
      return { ok: false, reason: 'Data has changed since that backup. Take a fresh backup, then try again.' };
    }
  }
  return { ok: true };
}
