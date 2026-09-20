import { db } from '@/server/db';
import { assignableRoles, isMisRole, type MisRoleName } from '@/lib/mis/roles';
import { MisForbiddenError, requirePermission, type MisActor } from './auth';
import { logAuditEvent } from './audit';
import { resolveVisibleEmployeeWhere, wouldCreateManagerCycle } from './visibility';

export type EmployeeInput = {
  employeeCode: string;
  name: string;
  nameHi?: string | null;
  role?: MisRoleName;
  phone?: string | null;
  departmentId?: string | null;
  /**
   * The D4 tree lives entirely in this one column (see `visibility.ts`).
   * `null` explicitly clears a manager; `undefined` leaves it unchanged.
   */
  managerId?: string | null;
};

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
  return db.misEmployee.findMany({
    where: { ...visible, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: { userProfile: { select: { email: true } } },
    orderBy: { name: 'asc' },
  });
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
  await requirePermission('employees.read');
  return db.misEmployee.findMany({
    where: { deletedAt: null },
    include: { userProfile: { select: { email: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getEmployee(id: string) {
  await requirePermission('employees.read');
  return db.misEmployee.findUnique({ where: { id }, include: { userProfile: true } });
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

export async function createEmployee(input: EmployeeInput) {
  const actor = await requirePermission('employees.write');
  assertMayAssignRole(actor, input.role);
  const created = await db.misEmployee.create({
    data: {
      employeeCode: input.employeeCode.trim().toUpperCase(),
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      role: input.role || 'WORKER',
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.create', entity: 'MisEmployee', entityId: created.id, after: created });
  return created;
}

export async function updateEmployee(id: string, patch: Partial<EmployeeInput>) {
  const actor = await requirePermission('employees.write');
  const before = await db.misEmployee.findUnique({ where: { id } });
  if (!before) throw new Error(`Employee ${id} not found`);
  // The employee screen resends the row's current role on every edit, so only a role CHANGE is
  // a grant. Restating the role a person already has hands out nothing.
  if (patch.role !== before.role) assertMayAssignRole(actor, patch.role);

  if (patch.managerId) {
    if (await wouldCreateManagerCycle(id, patch.managerId)) {
      throw new Error(
        'This person cannot be their own manager, or manage someone above themselves.',
      );
    }
  }

  const after = await db.misEmployee.update({ where: { id }, data: {
    ...(patch.employeeCode !== undefined ? { employeeCode: patch.employeeCode.trim().toUpperCase() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.nameHi !== undefined ? { nameHi: patch.nameHi?.trim() || null } : {}),
    ...(patch.role ? { role: patch.role } : {}),
    ...(patch.managerId !== undefined ? { managerId: patch.managerId } : {}),
  }});
  await logAuditEvent({ actorId: actor.userId, action: 'employee.update', entity: 'MisEmployee', entityId: id, before, after });
  return after;
}

export async function deleteEmployee(id: string) {
  const actor = await requirePermission('employees.write');
  const before = await db.misEmployee.findUnique({ where: { id } });
  if (!before) throw new Error(`Employee ${id} not found`);
  const after = await db.misEmployee.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.delete', entity: 'MisEmployee', entityId: id, before, after });
  return after;
}

export async function restoreEmployee(id: string) {
  const actor = await requirePermission('employees.write');
  const after = await db.misEmployee.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.restore', entity: 'MisEmployee', entityId: id, after });
  return after;
}
