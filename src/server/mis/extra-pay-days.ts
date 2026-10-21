import type { MisExtraPayDay, MisExtraPayKind, MisExtraPayScope } from '@/generated/prisma/client';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { db } from '@/server/db';

import { getFactoryTimezone } from './business-rules';

import { requirePermission, type MisActor } from './auth';
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
  /** A `YYYY-MM-DD` key (preferred), or an instant that is read as the FACTORY's calendar day. */
  date: Date | string;
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
  /** R2-116: who proposed it (name, else email). Null when the account is gone. */
  proposedByName?: string | null;
};

/** R2-116: what a proposer may see of the list - never the value (a proposer is not a wage reader). */
export type ExtraPayProposal = {
  id: string;
  date: string;
  scope: MisExtraPayScope;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  proposedByName: string | null;
};

/** user-profile id -> display name. Best effort: a lookup failure leaves names blank, never breaks the list. */
async function proposerNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return out;
  try {
    const rows = await db.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
    for (const r of rows) out.set(r.id, r.name?.trim() || r.email);
  } catch {
    /* names are a convenience */
  }
  return out;
}

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

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MULTIPLIER = 5;
const MAX_FLAT_AMOUNT = 100_000;
const MAX_DAYS_FROM_TODAY = 400;

/** R3 B45/B48: a valid factory-calendar day key, normalised, or a refusal. */
function normaliseDateKey(input: Date | string, timeZone: string): string {
  let key: string;
  if (typeof input === 'string') {
    if (!DATE_KEY.test(input)) throw new Error('The date must be in YYYY-MM-DD form.');
    key = input;
  } else {
    if (Number.isNaN(input.getTime())) throw new Error('The date is not valid.');
    key = factoryDateKey(input, timeZone);
  }
  const db = dateKeyToDbDate(key);
  if (Number.isNaN(db.getTime()) || db.toISOString().slice(0, 10) !== key) throw new Error('The date is not a real calendar day.');
  return key;
}

/** R2-115: the live departments a DEPARTMENTS-scoped day can name — the proposer's own door, not `masters.read`. */
export async function listDepartmentOptions(): Promise<{ id: string; name: string }[]> {
  await requirePermission('attendance.write');
  return db.misDepartment.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

/** Admin or Super Attendance Operator propose; an Owner (who holds every action) may too. */
export async function proposeExtraPayDay(input: ExtraPayDayInput): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('attendance.write');
  const timeZone = await getFactoryTimezone();
  const dateKey = normaliseDateKey(input.date, timeZone);
  const todayKey = factoryDateKey(new Date(), timeZone);
  if (dateKey < addDaysToDateKey(todayKey, -MAX_DAYS_FROM_TODAY) || dateKey > addDaysToDateKey(todayKey, MAX_DAYS_FROM_TODAY)) {
    throw new Error(`The date must be within ${MAX_DAYS_FROM_TODAY} days of today.`);
  }
  const date = dateKeyToDbDate(dateKey);
  if (input.scope === 'EMPLOYEES' && !(input.employeeIds && input.employeeIds.length > 0)) {
    throw new Error('An EMPLOYEES-scoped extra-pay day needs at least one employee.');
  }
  if (input.scope === 'DEPARTMENTS' && !(input.departmentIds && input.departmentIds.length > 0)) {
    throw new Error('A DEPARTMENTS-scoped extra-pay day needs at least one department.');
  }
  if (!input.reason.trim()) throw new Error('A reason is required.');
  if (!Number.isFinite(input.value) || !(input.value > 0)) throw new Error('Value must be a positive number.');
  if (input.kind === 'MULTIPLIER' && input.value > MAX_MULTIPLIER) throw new Error(`A multiplier is at most ${MAX_MULTIPLIER}.`);
  if (input.kind === 'FLAT_AMOUNT' && input.value > MAX_FLAT_AMOUNT) throw new Error(`A flat amount is at most ${MAX_FLAT_AMOUNT}.`);
  if (input.scope === 'EMPLOYEES') {
    const ids = [...new Set(input.employeeIds)];
    const found = await db.misEmployee.findMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, select: { id: true } });
    if (found.length !== ids.length) throw new Error('Every named employee must exist and be active.');
  }
  // An APPROVED day on the same date with an overlapping scope would pay twice.
  const sameDay = await db.misExtraPayDay.findMany({ where: { date: { gte: date, lte: date }, status: 'APPROVED' } });
  for (const other of sameDay) {
    if (await scopesOverlap(input, other)) throw new Error('An approved extra-pay day already covers this date for some of the same people.');
  }

  const created = await db.$transaction(async (tx) => {
    const row = await tx.misExtraPayDay.create({
      data: {
        date,
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

/** Two days overlap when either is ALL_PRESENT, or both name a common employee / department. */
async function scopesOverlap(a: ExtraPayDayInput, other: MisExtraPayDay): Promise<boolean> {
  if (a.scope === 'ALL_PRESENT' || other.scope === 'ALL_PRESENT') return true;
  if (a.scope !== other.scope) return false; // EMPLOYEES vs DEPARTMENTS: no way to tell cheaply, and no double pay is proven
  const row = await toRow(other);
  const mine = new Set(a.scope === 'EMPLOYEES' ? a.employeeIds : a.departmentIds);
  const theirs = a.scope === 'EMPLOYEES' ? row.employeeIds : row.departmentIds;
  return theirs.some((id) => mine.has(id));
}

/** Every extra-pay day, most recent first — Owner only (this includes the rupee/multiplier value). */
export async function listExtraPayDays(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): Promise<ExtraPayDayRow[]> {
  await requirePermission('wages.read');
  const rows = await db.misExtraPayDay.findMany({
    where: status ? { status } : undefined,
    orderBy: { date: 'desc' },
  });
  const out = await Promise.all(rows.map(toRow));
  const names = await proposerNames(out.map((r) => r.proposedById));
  return out.map((r) => ({ ...r, proposedByName: names.get(r.proposedById) ?? null }));
}

/**
 * R2-116: the proposals list for the people who propose (Admin, Super Attendance Operator, Owner):
 * date, who, why, status and the PROPOSER. The rupee value / multiplier is deliberately not selected.
 */
export async function listExtraPayProposals(): Promise<ExtraPayProposal[]> {
  await requirePermission('attendance.write');
  const rows = await db.misExtraPayDay.findMany({
    select: { id: true, date: true, scope: true, reason: true, status: true, proposedById: true },
    orderBy: { date: 'desc' },
    take: 200,
  });
  const names = await proposerNames(rows.map((r) => r.proposedById));
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    scope: r.scope,
    reason: r.reason,
    status: r.status as ExtraPayProposal['status'],
    proposedByName: names.get(r.proposedById) ?? null,
  }));
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

/** The single PENDING -> decided transition: `updateMany where status PENDING`, so a double decision loses cleanly. */
async function decide(actor: MisActor, id: string, status: 'APPROVED' | 'REJECTED', action: string): Promise<ExtraPayDayRow> {
  const before = await db.misExtraPayDay.findUnique({ where: { id } });
  if (!before) throw new Error(`Extra-pay day ${id} not found`);
  const { count } = await db.misExtraPayDay.updateMany({
    where: { id, status: 'PENDING' },
    // R3 B48: a rejection records its decider and time as well.
    data: { status, approvedById: actor.userId, approvedAt: new Date() },
  });
  if (count === 0) throw new Error('Already decided.');
  const after = await db.misExtraPayDay.findUnique({ where: { id } });
  if (!after) throw new Error(`Extra-pay day ${id} not found`);
  await logAuditEvent({ actorId: actor.userId, action, entity: 'MisExtraPayDay', entityId: id, before: auditSafe(before), after: auditSafe(after) });
  return toRow(after);
}

/** Owner approves - D28: "it counts only once the Owner approves." */
export async function approveExtraPayDay(id: string): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('wages.read');
  return decide(actor, id, 'APPROVED', 'extraPayDay.approve');
}

/** Owner rejects - the proposer sees why via `reason`/status, never a second approval path. */
export async function rejectExtraPayDay(id: string): Promise<ExtraPayDayRow> {
  const actor = await requirePermission('wages.read');
  return decide(actor, id, 'REJECTED', 'extraPayDay.reject');
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
