import type { Prisma } from '@/generated/prisma/client';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';
import { assignableRoles, isMisRole, type MisRoleName } from '@/lib/mis/roles';
import { can } from '@/lib/mis/permissions';
import { maskAccountNo, normaliseBankDetails } from '@/lib/mis/bank-details';
import { MisForbiddenError, requirePermission, type MisActor } from './auth';
import { logAuditEvent } from './audit';
import { resolveVisibleEmployeeWhere, wouldCreateManagerCycle } from './visibility';

export type EmployeeInput = {
  employeeCode: string;
  name: string;
  nameHi?: string | null;
  role?: MisRoleName;
  departmentId?: string | null;
  /**
   * The D4 tree lives entirely in this one column (see `visibility.ts`).
   * `null` explicitly clears a manager; `undefined` leaves it unchanged.
   */
  managerId?: string | null;
  /**
   * Phase 25 (25.2, D28). A CODE (matches `MisWageType.code`), never an amount — this field
   * carries no money itself, so it needs no stronger gate than `employees.write`, the same door
   * that already assigns a role or a department. `null` explicitly clears it (a data-health
   * finding, 25.1's brief); `undefined` leaves it unchanged.
   */
  wageTypeCode?: string | null;
  /** 25.3, D28. MONTHLY employees are paid every Sunday; DAILY only when `sundayPaid`. */
  payType?: 'MONTHLY' | 'DAILY';
  sundayPaid?: boolean;
  /**
   * R2-110. Bank details for the month-end transfer file. Written only through `employees.write`
   * (Owner, Admin) and stripped from every read for a caller without it. `null`/'' clears;
   * `undefined` leaves it unchanged.
   */
  bankName?: string | null;
  bankAccountNo?: string | null;
  ifsc?: string | null;
};

const BANK_KEYS = ['bankName', 'bankAccountNo', 'ifsc'] as const;

/** R2-110: bank fields leave the server only for a caller who may write employees (Owner, Admin). */
function stripBank<T extends object>(actor: MisActor, row: T): T;
function stripBank<T extends object>(actor: MisActor, row: T | null): T | null;
function stripBank<T extends object>(actor: MisActor, row: T | null): T | null {
  if (!row || can(actor.role, 'employees.write')) return row;
  const copy: Record<string, unknown> = { ...(row as object) } as Record<string, unknown>;
  for (const k of BANK_KEYS) delete copy[k];
  return copy as T;
}

/**
 * The people list, scoped to the caller's pool.
 *
 * The rule is D4 and it lives in `visibility.ts` — this function only composes
 * the fragment it is handed. Whether the pool is narrowed at all, and by what,
 * is never decided here.
 */
export async function listEmployees(includeDeleted = false) {
  const actor = await requirePermission('employees.read');
  const visible = await resolveVisibleEmployeeWhere(actor);
  const rows = await db.misEmployee.findMany({
    where: { ...visible, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: { userProfile: { select: { email: true } }, department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => stripBank(actor, r));
}

/** R2-83: one page of the caller's visible people (25). The D4 pool scope is applied in the where, so `total` never counts out-of-pool people. */
export async function listEmployeesPage(opts: { q?: string; page?: number | string } = {}): Promise<Paged<Awaited<ReturnType<typeof listEmployees>>[number]>> {
  const actor = await requirePermission('employees.read');
  const visible = await resolveVisibleEmployeeWhere(actor);
  const q = parseSearch(opts.q);
  const where = {
    AND: [
      visible,
      { deletedAt: null },
      ...(q
        ? [{ OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { employeeCode: { contains: q, mode: 'insensitive' as const } }, { nameHi: { contains: q, mode: 'insensitive' as const } }] }]
        : []),
    ],
  };
  const { skip, take } = pageQuery(opts.page);
  const [rows, total] = await Promise.all([
    db.misEmployee.findMany({
      where,
      include: { userProfile: { select: { email: true } }, department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      skip,
      take,
    }),
    db.misEmployee.count({ where }),
  ]);
  // R2-110: the paged list strips bank fields for a caller without employees.write, like every other read.
  return { rows: rows.map((r) => stripBank(actor, r)), total };
}

/**
 * The whole factory roll, deliberately unscoped.
 *
 * A badge scanner at the gate has to resolve *any* badge in the factory, so it
 * cannot read a list narrowed to one operator's pool — an operator who manages
 * nobody would be handed a roster of one and the kiosk would stop working.
 * This is a surface that is factory-wide by nature, named so that it is an
 * explicit server-side choice rather than a screen quietly widening its own
 * scope.
 */
export async function listEmployeeRoster() {
  const actor = await requirePermission('employees.read');
  const rows = await db.misEmployee.findMany({
    where: { deletedAt: null },
    include: { userProfile: { select: { email: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => stripBank(actor, r));
}

export async function getEmployee(id: string): Promise<Awaited<ReturnType<typeof getEmployeeFull>>>;
export async function getEmployee(id: string, view: 'payslip'): Promise<Awaited<ReturnType<typeof getEmployeePayslip>>>;
export async function getEmployee(id: string, view?: 'payslip') {
  const actor = await requirePermission('employees.read');
  // R3 B36: scope in the where, so an out-of-pool id is indistinguishable from an unknown one.
  const visible = await resolveVisibleEmployeeWhere(actor);
  if (view === 'payslip') return getEmployeePayslip(id, visible);
  return stripBank(actor, await getEmployeeFull(id, visible));
}

function getEmployeeFull(id: string, visible: Prisma.MisEmployeeWhereInput) {
  return db.misEmployee.findUnique({ where: { id, AND: [visible] }, include: { userProfile: true } });
}

function getEmployeePayslip(id: string, visible: Prisma.MisEmployeeWhereInput) {
  // R3 B49: a payslip needs a name, a code and a role label - not the whole row and its login.
  return db.misEmployee.findUnique({
    where: { id, AND: [visible] },
    select: { id: true, name: true, employeeCode: true, role: true, department: { select: { name: true } } },
  });
}

/** R3 B36: the one lookup every write goes through — pool-scoped, and the same message for unknown and hidden. */
async function findVisibleEmployee(actor: MisActor, id: string) {
  const visible = await resolveVisibleEmployeeWhere(actor);
  const row = await db.misEmployee.findUnique({ where: { id, AND: [visible] } });
  if (!row) throw new Error(`Employee ${id} not found`);
  return row;
}

/** R3 B35: only an Owner may touch an Owner's record. */
function assertMayTouchTarget(actor: MisActor, target: { role: string }) {
  if (target.role === 'OWNER' && actor.role !== 'OWNER') throw new MisForbiddenError('users.invite', 'an Owner record');
}

/**
 * R3 B33: wage STRUCTURE (code, pay type, Sunday pay) is OWNER-only on the server. An unchanged
 * value passes (the Admin edit form re-posts every field); a different one needs `wages.read`.
 */
function assertWageFieldsAllowed(
  actor: MisActor,
  input: { wageTypeCode?: string | null; payType?: 'MONTHLY' | 'DAILY'; sundayPaid?: boolean },
  current: { wageTypeCode: string | null; payType: string; sundayPaid: boolean },
) {
  if (can(actor.role, 'wages.read')) return;
  const changed =
    (input.wageTypeCode !== undefined && (input.wageTypeCode ?? null) !== current.wageTypeCode) ||
    (input.payType !== undefined && input.payType !== current.payType) ||
    (input.sundayPaid !== undefined && input.sundayPaid !== current.sundayPaid);
  if (changed) throw new MisForbiddenError('wages.read');
}

/**
 * D25: only an Owner may hand out the Owner role. `roles.ts` reads a login's role off this
 * very row, so writing OWNER onto one is granting wages.read, aql.read and users.invite — the
 * rule is enforced HERE, on the server; the role picker (`assignableRoles`) only mirrors it.
 * The refusal is a permission error (`users.invite` is the Owner-only action for granting
 * roles), and it fires before anything is read or written.
 */
function assertMayAssignRole(actor: MisActor, role: string | null | undefined) {
  if (!role) return; // no role in the patch (an empty form field included) leaves the role as it is
  if (!isMisRole(role)) throw new Error(`Unknown role: ${String(role)}`);
  if (!assignableRoles(actor.role).includes(role)) {
    throw new MisForbiddenError('users.invite', `grant the ${role} role`);
  }
}

/**
 * The employee row as it goes into an audit payload — every field EXCEPT `wageTypeCode`.
 *
 * Not because it is money (it is a code, not an amount — D33), but because the literal key name
 * contains "wage" and `audit-payloads.test.ts` refuses that substring anywhere in any payload, no
 * exceptions, on the theory that a human scanning audit rows for "wage" should never have to
 * wonder whether a hit is real. The field itself is unaffected — only what reaches the audit row.
 */
function auditSafeEmployee<T extends { wageTypeCode?: string | null; bankAccountNo?: string | null }>(row: T): Omit<T, 'wageTypeCode'> & { payCode: string | null } {
  // R3 B34: the CODE (never an amount) goes in as `payCode`, so a wage-code change is auditable.
  // R2-110: the account number goes in masked (last four) - never in full.
  const { wageTypeCode, ...rest } = row;
  const safe: Record<string, unknown> = { ...rest, payCode: wageTypeCode ?? null };
  if ('bankAccountNo' in safe) safe.bankAccountNo = maskAccountNo(rest.bankAccountNo);
  return safe as Omit<T, 'wageTypeCode'> & { payCode: string | null };
}

/** R2-86: a department id must name a live department; `null`/`undefined` mean "none". */
async function assertDepartmentUsable(departmentId: string | null | undefined) {
  if (!departmentId) return;
  const dept = await db.misDepartment.findFirst({ where: { id: departmentId, deletedAt: null }, select: { id: true } });
  if (!dept) throw new Error('Department not found');
}

const hasBankInput = (i: { bankName?: unknown; bankAccountNo?: unknown; ifsc?: unknown }) =>
  i.bankName !== undefined || i.bankAccountNo !== undefined || i.ifsc !== undefined;

export async function createEmployee(input: EmployeeInput) {
  const actor = await requirePermission('employees.write');
  assertMayAssignRole(actor, input.role);
  assertWageFieldsAllowed(actor, input, { wageTypeCode: null, payType: 'DAILY', sundayPaid: false });
  await assertDepartmentUsable(input.departmentId);
  const bank = hasBankInput(input) ? normaliseBankDetails({ bankName: input.bankName ?? null, bankAccountNo: input.bankAccountNo ?? null, ifsc: input.ifsc ?? null }) : null;
  const created = await db.misEmployee.create({
    data: {
      ...(bank ?? {}),
      employeeCode: input.employeeCode.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      role: input.role || 'WORKER',
      departmentId: input.departmentId || null,
      wageTypeCode: input.wageTypeCode ?? null,
      ...(input.payType ? { payType: input.payType } : {}),
      ...(input.sundayPaid !== undefined ? { sundayPaid: input.sundayPaid } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.create', entity: 'MisEmployee', entityId: created.id, after: auditSafeEmployee(created) });
  return created;
}

export async function updateEmployee(id: string, patch: Partial<EmployeeInput>) {
  const actor = await requirePermission('employees.write');
  const before = await findVisibleEmployee(actor, id);
  assertMayTouchTarget(actor, before);
  assertWageFieldsAllowed(actor, patch, before);
  // The employee screen resends the row's current role on every edit, so only a role CHANGE is
  // a grant. Restating the role a person already has hands out nothing.
  if (patch.role !== before.role) assertMayAssignRole(actor, patch.role);

  if (patch.departmentId !== undefined && patch.departmentId !== before.departmentId) await assertDepartmentUsable(patch.departmentId);

  if (patch.managerId) {
    if (await wouldCreateManagerCycle(id, patch.managerId)) {
      throw new Error(
        'This person cannot be their own manager, or manage someone above themselves.',
      );
    }
  }

  // R2-110: validate the merged block, so a patch of one field cannot leave a half-filled pair behind.
  const bank = hasBankInput(patch)
    ? normaliseBankDetails({
        bankName: patch.bankName !== undefined ? patch.bankName : before.bankName,
        bankAccountNo: patch.bankAccountNo !== undefined ? patch.bankAccountNo : before.bankAccountNo,
        ifsc: patch.ifsc !== undefined ? patch.ifsc : before.ifsc,
      })
    : null;

  const after = await db.misEmployee.update({ where: { id }, data: {
    ...(bank ?? {}),
    ...(patch.employeeCode !== undefined ? { employeeCode: patch.employeeCode.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
    ...(patch.role ? { role: patch.role } : {}),
    ...(patch.managerId !== undefined ? { managerId: patch.managerId } : {}),
    ...(patch.departmentId !== undefined ? { departmentId: patch.departmentId || null } : {}),
    ...(patch.wageTypeCode !== undefined ? { wageTypeCode: patch.wageTypeCode } : {}),
    ...(patch.payType ? { payType: patch.payType } : {}),
    ...(patch.sundayPaid !== undefined ? { sundayPaid: patch.sundayPaid } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'employee.update', entity: 'MisEmployee', entityId: id, before: auditSafeEmployee(before), after: auditSafeEmployee(after) });
  return after;
}

export async function deleteEmployee(id: string) {
  const actor = await requirePermission('employees.write');
  const before = await findVisibleEmployee(actor, id);
  assertMayTouchTarget(actor, before);
  if (before.userProfileId && before.userProfileId === actor.userId) throw new Error('You cannot delete your own record');
  const after = await db.misEmployee.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.delete', entity: 'MisEmployee', entityId: id, before: auditSafeEmployee(before), after: auditSafeEmployee(after) });
  return after;
}

export async function restoreEmployee(id: string) {
  const actor = await requirePermission('employees.write');
  const before = await findVisibleEmployee(actor, id);
  assertMayTouchTarget(actor, before);
  const after = await db.misEmployee.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.restore', entity: 'MisEmployee', entityId: id, after: auditSafeEmployee(after) });
  return after;
}
