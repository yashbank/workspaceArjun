/**
 * R2-102 — the Owner's PAID / UNPAID choice per leave type, and the reader payroll prices with.
 *
 * OWNER only, every door (`wages.read`, S9 / D24): whether a leave day earns a day's wage moves every
 * payslip, so a non-Owner can neither read nor change it. History is append-only
 * (`MisLeavePayRule`): a change is a new row starting on the factory's today (D22), audited as
 * `leavePay.set` with the flag before and after — never a rupee figure. A payroll month uses the
 * choice in force on its LAST day (`lib/mis/leave-pay.ts`); a CLOSED month reads its snapshot.
 *
 * Until the parked migration 20261020000000_r2_leave_pay_setting runs, the table is missing: readers
 * fall back to the built-in defaults (every type unpaid) and a save is refused in words.
 */

import type { Prisma } from '@/generated/prisma/client';
import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import {
  buildLeavePayView,
  leavePayAsOf,
  monthEndKey,
  validateLeavePayChange,
  type LeavePayMap,
  type LeavePayRuleRow,
  type LeavePayView,
} from '@/lib/mis/leave-pay';
import { LEAVE_TYPE_LABEL, type LeaveType } from '@/lib/mis/leave';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getFactoryTimezone } from '@/server/mis/business-rules';

const SETUP_PENDING = 'Leave pay needs the R2 database update (20261020000000_r2_leave_pay_setting) before it can be changed. Until then the defaults apply.';

/** Only "the table does not exist yet" (a pre-migration database) reads as "no change made yet". */
function isMissingRelationError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'P2021' || (typeof e?.message === 'string' && /relation .* does not exist/i.test(e.message));
}

const SELECT = { id: true, leaveType: true, paid: true, effectiveFrom: true, createdAt: true, reason: true, changedById: true } as const;

async function readRules(client: Prisma.TransactionClient, where: Prisma.MisLeavePayRuleWhereInput = {}): Promise<{ rows: LeavePayRuleRow[]; missing: boolean }> {
  try {
    const rows = await client.misLeavePayRule.findMany({ where, select: SELECT, orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }] });
    return { rows, missing: false };
  } catch (error) {
    if (isMissingRelationError(error)) return { rows: [], missing: true };
    throw error;
  }
}

/** The Settings > Leave pay screen: each type's flag today, and every change ever made, newest first. */
export async function getLeavePaySettings(now: Date = new Date()): Promise<LeavePayView> {
  await requirePermission('wages.read');
  const todayKey = factoryDateKey(now, await getFactoryTimezone());
  const { rows, missing } = await readRules(db);
  const personIds = [...new Set(rows.map((r) => r.changedById).filter((id): id is string => !!id))];
  const people = personIds.length ? await db.userProfile.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(people.filter((p) => p.name).map((p) => [p.id, p.name as string]));
  return buildLeavePayView(rows, { todayKey, names, setupPending: missing });
}

/**
 * Mark one leave type PAID or UNPAID from the factory's today. Refuses a no-op (it is already that),
 * so the history only ever holds real changes. A second change on the same day is allowed: the
 * later one wins (by `createdAt`) and both stay on the record.
 */
export async function setLeavePay(input: { leaveType: unknown; paid: unknown; reason?: unknown }, now: Date = new Date()) {
  const actor = await requirePermission('wages.read');
  const invalid = validateLeavePayChange(input);
  if (invalid) throw new Error(invalid);
  const leaveType = input.leaveType as LeaveType;
  const paid = input.paid as boolean;
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
  const todayKey = factoryDateKey(now, await getFactoryTimezone());

  const { rows, missing } = await readRules(db, { leaveType });
  if (missing) throw new Error(SETUP_PENDING);
  const before = leavePayAsOf(rows, todayKey)[leaveType];
  if (before === paid) throw new Error(`${LEAVE_TYPE_LABEL[leaveType]} is already ${paid ? 'paid' : 'unpaid'}`);

  let rec;
  try {
    rec = await db.misLeavePayRule.create({
      data: { leaveType, paid, effectiveFrom: dateKeyToDbDate(todayKey), reason, changedById: actor.userId, createdAt: now },
    });
  } catch (error) {
    if (isMissingRelationError(error)) throw new Error(SETUP_PENDING);
    throw error;
  }
  await logAuditEvent({
    actorId: actor.userId,
    action: 'leavePay.set',
    entity: 'MisLeavePayRule',
    entityId: rec.id,
    before: { leaveType, paid: before },
    after: { leaveType, paid, effectiveFrom: todayKey, ...(reason ? { reason } : {}) },
  });
  return { id: rec.id, leaveType, paid, effectiveFrom: todayKey };
}

/**
 * The flags a payroll month prices with: the newest choice on or before the month's last day, or the
 * default. Runs on the caller's client (payroll's). A missing table reads as "defaults".
 */
export async function getLeavePayForMonth(year: number, month: number, client: Prisma.TransactionClient = db): Promise<LeavePayMap> {
  await requirePermission('wages.read');
  const endKey = monthEndKey(year, month);
  const { rows } = await readRules(client, { effectiveFrom: { lte: dateKeyToDbDate(endKey) } });
  return leavePayAsOf(rows, endKey);
}
