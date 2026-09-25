import type { MisExtraPayDay, MisExtraPayKind, MisExtraPayScope } from '@/generated/prisma/client';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

/**
 * Extra-pay days (25.4, D28).
 *
 * PROPOSING is not itself a wage read: Admin and Super Attendance Operator hold `attendance.write`
 * but not `wages.read` (D28 names them explicitly as proposers), and a proposer already knows the
 * figure they just typed — writing a value is not gated the same way reading one back is (the F-15
 * precedent). Every other door here — approving, rejecting, listing with the figure attached, or
 * folding an approved day into payroll — is `wages.read`, Owner only, because from that point on
 * it is a wage decision, not a draft. This is the ONE place a non-Owner can raise the wage bill, so
 * every write is audited without ever putting the rupee value or multiplier into the payload
 * (D24) — the audit row says WHICH day, WHO, and its status, never the figure, matching how
 * `business-rules.ts` already omits a wage rule's value from its own audit rows (F-04).
 */

export type ExtraPayDayInput = {
  date: Date;
  kind: MisExtraPayKind;
  /** The multiplier (e.g. 2.0) or the flat rupee amount, per `kind`. */
  value: number;
  scope: MisExtraPayScope;
  employeeIds?: string[];
  departmentIds?: string[];
  reason: string;
};

export type ExtraPayDayRow = {
  id: string;
  date: Date;
  kind: MisExtraPayKind;
  value: number;
  scope: MisExtraPayScope;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  proposedById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  employeeIds: string[];
  departmentIds: string[];
};

function auditSafe(row: MisExtraPayDay) {
  return { id: row.id, date: row.date, kind: row.kind, scope: row.scope, status: row.status, reason: row.reason };
}

async function toRow(row: MisExtraPayDay): Promise<ExtraPayDayRow> {
  const [employees, departments] = await Promise.all([
    row.scope === 'EMPLOYEES' ? db.misExtraPayDayEmployee.findMany({ where: { extraPayDayId: row.id }, select: { employeeId: true } }) : Promise.resolve([]),
    row.scope === 'DEPARTMENTS' ? db.misExtraPayDayDepartment.findMany({ where: { extraPayDayId: row.id }, select: { departmentId: true } }) : Promise.resolve([]),
  ]);
  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    value: Number(row.value),
    scope: row.scope,
    reason: row.reason,
    status: row.status,
    proposedById: row.proposedById,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
    employeeIds: employees.map((e) => e.employeeId),
    departmentIds: departments.map((d) => d.departmentId),
  };
}

/** Admin or Super Attendance Operator propose; an Owner (who holds every action) may too. */
export async function proposeExtraPayDay(input: ExtraPayDayInput): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('attendance.write');
  if (input.scope === 'EMPLOYEES' && !(input.employeeIds && input.employeeIds.length > 0)) {
    throw new Error('An EMPLOYEES-scoped extra-pay day needs at least one employee.');
  }
  if (input.scope === 'DEPARTMENTS' && !(input.departmentIds && input.departmentIds.length > 0)) {
    throw new Error('A DEPARTMENTS-scoped extra-pay day needs at least one department.');
  }
  if (!input.reason.trim()) throw new Error('A reason is required.');
  if (!(input.value > 0)) throw new Error('Value must be a positive number.');

  const created = await db.$transaction(async (tx) => {
    const row = await tx.misExtraPayDay.create({
      data: {
        date: input.date,
        kind: input.kind,
        value: input.value,
        scope: input.scope,
        reason: input.reason.trim(),
        status: 'PENDING',
        proposedById: actor.userId,
      },
    });
    if (input.scope === 'EMPLOYEES' && input.employeeIds) {
      await tx.misExtraPayDayEmployee.createMany({
        data: input.employeeIds.map((employeeId) => ({ extraPayDayId: row.id, employeeId })),
      });
    }
    if (input.scope === 'DEPARTMENTS' && input.departmentIds) {
      await tx.misExtraPayDayDepartment.createMany({
        data: input.departmentIds.map((departmentId) => ({ extraPayDayId: row.id, departmentId })),
      });
    }
    return row;
  });

  await logAuditEvent({ actorId: actor.userId, action: 'extraPayDay.propose', entity: 'MisExtraPayDay', entityId: created.id, after: auditSafe(created) });
  return toRow(created);
}

/** Every extra-pay day, most recent first — Owner only (this includes the rupee/multiplier value). */
export async function listExtraPayDays(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<ExtraPayDayRow[]> {
  await requirePermission('wages.read');
  const rows = await db.misExtraPayDay.findMany({
    where: status ? { status } : undefined,
    orderBy: { date: 'desc' },
  });
  return Promise.all(rows.map(toRow));
}

/** Every APPROVED extra-pay day touching `year`/`month` — what payroll folds in. Owner only. */
export async function listApprovedExtraPayDaysForMonth(year: number, month: number): Promise<ExtraPayDayRow[]> {
  await requirePermission('wages.read');
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const rows = await db.misExtraPayDay.findMany({
    where: { status: 'APPROVED', date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });
  return Promise.all(rows.map(toRow));
}

/** Owner approves — D28: "it counts only once the Owner approves." */
export async function approveExtraPayDay(id: string): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('wages.read');
  const before = await db.misExtraPayDay.findUnique({ where: { id } });
  if (!before) throw new Error(`Extra-pay day ${id} not found`);
  if (before.status !== 'PENDING') throw new Error(`Extra-pay day is already ${before.status.toLowerCase()}.`);
  const after = await db.misExtraPayDay.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'extraPayDay.approve', entity: 'MisExtraPayDay', entityId: id, before: auditSafe(before), after: auditSafe(after) });
  return toRow(after);
}

/** Owner rejects — the proposer sees why via `reason`/status, never a second approval path. */
export async function rejectExtraPayDay(id: string): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('wages.read');
  const before = await db.misExtraPayDay.findUnique({ where: { id } });
  if (!before) throw new Error(`Extra-pay day ${id} not found`);
  if (before.status !== 'PENDING') throw new Error(`Extra-pay day is already ${before.status.toLowerCase()}.`);
  const after = await db.misExtraPayDay.update({ where: { id }, data: { status: 'REJECTED' } });
  await logAuditEvent({ actorId: actor.userId, action: 'extraPayDay.reject', entity: 'MisExtraPayDay', entityId: id, before: auditSafe(before), after: auditSafe(after) });
  return toRow(after);
}

/**
 * Count of PENDING extra-pay days — Owner only, for the approvals badge. A non-Owner calling
 * `getPendingApprovals` must never learn even this count reflects a wage decision, so this is a
 * separate function `approvals.ts` calls ONLY when the caller already holds `wages.read`, never
 * merged into the general count unconditionally.
 */
export async function countPendingExtraPayDays(): Promise<number> {
  await requirePermission('wages.read');
  return db.misExtraPayDay.count({ where: { status: 'PENDING' } });
}
