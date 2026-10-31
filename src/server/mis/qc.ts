import { evaluateAql, resolveAqlPlans, thresholdsFromPlan, type AqlResult } from '@/lib/mis/aql';
import { correctionVerdict, requireCorrectionReason } from '@/lib/mis/entry-correction';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, factoryMinuteOfDay } from '@/lib/mis/factory-time';
import { isOrderClosed } from '@/lib/mis/order-status';
import { latestChecks } from '@/lib/mis/qc-verdict';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getAqlThresholds, getFactoryTimezone, getRuleValue } from '@/server/mis/business-rules';
import { notifySupervisorsOfQcDefect } from '@/server/notifications';

/** checkById has no formal FK (it can point at any Supabase auth user, not
 * just a mis_employees row) so it isn't a Prisma relation — resolve names
 * with a small batch lookup instead, same shape the UI already expects. */
export async function withCheckerNames<T extends { checkById: string | null }>(checks: T[]) {
  const ids = [...new Set(checks.map((c) => c.checkById).filter((id): id is string => !!id))];
  if (ids.length === 0) return checks.map((c) => ({ ...c, checkBy: null }));
  const profiles = await db.userProfile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const byId = new Map(profiles.map((p) => [p.id, p.name]));
  return checks.map((c) => ({ ...c, checkBy: c.checkById ? { name: byId.get(c.checkById) ?? '—' } : null }));
}

/** The result values the grid, the checklist and the form all use. */
const QC_RESULTS = ['PASS', 'FAIL', 'NA'] as const;
const EDIT_REFUSAL = 'This check can no longer be edited (24 h / acknowledged / order closed)';

type CheckFields = { result: string; defectType?: string | null; defectQty?: number | null; notes?: string | null };

/**
 * R3-QCR B73: the rules every QC check obeys, whether it is added, tapped on the checklist, or edited.
 * `requireFailReason` is false only for the checklist's plain FAIL tap, which is a one-tap paper-form
 * mark with no room for a reason (the Plate-error tap carries its own defectType).
 */
function validateCheckFields(f: CheckFields, requireFailReason: boolean) {
  if (!(QC_RESULTS as readonly string[]).includes(f.result)) throw new Error('Result must be Pass, Fail or N/A');
  if (f.defectQty != null && (!Number.isFinite(Number(f.defectQty)) || Number(f.defectQty) < 0)) {
    throw new Error('Defect quantity must be 0 or more');
  }
  if (requireFailReason && f.result === 'FAIL' && !f.defectType?.trim() && (f.notes?.trim().length ?? 0) < 3) {
    throw new Error('A failed check needs a defect type or a note of at least 3 characters');
  }
}

async function assertOrderOpen(orderId: string) {
  const order = await db.misOrder.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) throw new Error('Order not found');
  if (isOrderClosed(order.status ?? '')) throw new Error(`Order is ${String(order.status).toLowerCase()}; QC checks can no longer be recorded`);
}

async function assertStageBelongsToOrder(orderId: string, bomStageId: string) {
  const stage = await db.misBomStage.findFirst({ where: { id: bomStageId, bom: { orderId } }, select: { id: true } });
  if (!stage) throw new Error('That process stage does not belong to this order');
}

/**
 * R3-QCR B84 / R2-34: correct a check. Who and until when is `correctionVerdict`
 * (lib/mis/entry-correction.ts): Admin/Owner within 7 days; a QC inspector their OWN checks on the
 * same factory day. An acknowledged check or a closed order freezes it for everyone. Gated on
 * `qc.write`; every edit carries a reason, and the audit row has before/after plus the reason.
 */
export async function editQcCheck(
  id: string,
  patch: { result?: string; defectType?: string | null; defectQty?: number | null; notes?: string | null; parameterName?: string; reason?: string },
  now: Date = new Date(),
) {
  const actor = await requirePermission('qc.write');
  const before = await db.misQcCheck.findUnique({ where: { id } });
  if (!before || before.voidedAt) throw new Error('QC check not found');
  const order = await db.misOrder.findUnique({ where: { id: before.orderId }, select: { status: true } });
  const closed = !order || isOrderClosed(order.status ?? '');
  const verdict = correctionVerdict({
    kind: 'QC',
    action: 'EDIT',
    role: actor.role,
    actorId: actor.userId,
    ownerId: before.checkById,
    at: new Date(before.createdAt),
    now,
    timeZone: await getFactoryTimezone(),
  });
  if (!verdict.allowed || before.acknowledgedAt || closed) {
    throw new Error(verdict.allowed ? EDIT_REFUSAL : `${EDIT_REFUSAL}: ${verdict.reason}`);
  }
  const reason = requireCorrectionReason(patch.reason);
  const merged = {
    result: patch.result ?? before.result,
    defectType: patch.defectType !== undefined ? patch.defectType : before.defectType,
    defectQty: patch.defectQty !== undefined ? patch.defectQty : before.defectQty == null ? null : Number(before.defectQty),
    notes: patch.notes !== undefined ? patch.notes : before.notes,
  };
  validateCheckFields(merged, true);
  const data: Record<string, unknown> = {};
  for (const key of ['result', 'defectType', 'defectQty', 'notes', 'parameterName'] as const) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  const pick = (r: Record<string, unknown>) => ({ result: r.result, defectType: r.defectType, defectQty: r.defectQty == null ? null : Number(r.defectQty), notes: r.notes, parameterName: r.parameterName });
  const beforeSnapshot = pick(before as Record<string, unknown>);
  const after = await db.misQcCheck.update({ where: { id }, data });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'QC_CHECK_EDIT',
    entity: 'MisQcCheck',
    entityId: id,
    before: beforeSnapshot,
    after: pick(after as Record<string, unknown>),
    reason,
  });
  if (after.result === 'FAIL' && before.result !== 'FAIL') await notifyOfDefect(after);
  return after;
}

/**
 * R2-34 — delete a QC check under the same rule as an edit. VOIDED, not erased (voidedAt +
 * voidReason): the CoA, the grid and every summary skip it; the audit trail keeps it.
 */
export async function voidQcCheck(id: string, reasonInput: string, now: Date = new Date()) {
  const actor = await requirePermission('qc.write');
  const before = await db.misQcCheck.findUnique({ where: { id } });
  if (!before || before.voidedAt) throw new Error('QC check not found');
  const verdict = correctionVerdict({
    kind: 'QC',
    action: 'DELETE',
    role: actor.role,
    actorId: actor.userId,
    ownerId: before.checkById,
    at: new Date(before.createdAt),
    now,
    timeZone: await getFactoryTimezone(),
  });
  if (!verdict.allowed) throw new Error(verdict.reason);
  if (before.acknowledgedAt) throw new Error('This failure has been acknowledged; it can no longer be deleted.');
  const order = await db.misOrder.findUnique({ where: { id: before.orderId }, select: { status: true } });
  if (!order || isOrderClosed(order.status ?? '')) throw new Error('The order is closed; its checks can no longer be changed.');
  const reason = requireCorrectionReason(reasonInput);
  const rec = await db.misQcCheck.update({ where: { id }, data: { voidedAt: now, voidReason: reason } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'QC_CHECK_VOID',
    entity: 'MisQcCheck',
    entityId: id,
    before: { result: before.result, parameterName: before.parameterName, defectType: before.defectType, checkTime: new Date(before.checkTime).toISOString() },
    after: { voidedAt: now.toISOString() },
    reason,
  });
  return rec;
}

export async function addQcCheck(
  data: {
    orderId: string;
    bomStageId?: string;
    parameterName?: string;
    result: 'PASS' | 'FAIL' | 'NA';
    defectType?: string;
    defectQty?: number;
    notes?: string;
    /** V2 Epic 5: set when the check is a checklist tap (qc-template.ts). */
    templateId?: string;
    slotTime?: string;
  },
  /** Server-internal (the server action passes only `data`): the checklist's plain FAIL tap carries no reason. */
  options: { requireFailReason?: boolean } = {},
) {
  const actor = await requirePermission('qc.write');
  validateCheckFields(data, options.requireFailReason ?? true);
  await assertOrderOpen(data.orderId);
  if (data.bomStageId) await assertStageBelongsToOrder(data.orderId, data.bomStageId);
  const rec = await db.misQcCheck.create({
    data: { ...data, parameterName: data.parameterName ?? 'General', checkTime: new Date(), checkById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_QC_CHECK', entity: 'MisQcCheck', entityId: rec.id, after: rec });
  if (rec.result === 'FAIL') await notifyOfDefect(rec);
  return rec;
}

/**
 * MIS-174/191 — "immediate notification": every active SUPERVISOR learns of a FAIL the moment
 * it is logged, the same `notification` table `job-phases.ts`'s sign-off handover already writes
 * to (MIS-163's precedent, no second notification system). Best-effort, same discipline as
 * `logAuditEvent`: a failed write here must never fail — or re-throw past — the QC check itself.
 */
async function notifyOfDefect(check: { id: string; orderId: string; parameterName: string | null; defectType: string | null; checkTime: Date }) {
  try {
    const order = await db.misOrder.findUnique({ where: { id: check.orderId }, select: { orderNumber: true } });
    await notifySupervisorsOfQcDefect({
      orderId: check.orderId,
      orderNumber: order?.orderNumber ?? '—',
      parameterName: check.parameterName ?? 'General',
      defectType: check.defectType,
      checkTime: check.checkTime.toISOString(),
    });
  } catch (error) {
    console.error('[mis-qc] failed to notify supervisors of a defect', { checkId: check.id, error });
  }
}

export type AqlDefectLine = { defectTypeId: string; qty: number };

/**
 * Score a QC sample against the current AQL thresholds and record the
 * decision as a QC check.
 *
 * The decision (PASS/FAIL) is written once and never recomputed — MIS-272's
 * rule, which this ticket inherits: a threshold changed tomorrow must not
 * flip a decision made today. `evaluateAql` itself never touches the
 * database, so the thresholds a decision used are captured only here, as an
 * immutable audit-log snapshot alongside the decision.
 */
export async function recordAqlSample(input: {
  orderId: string;
  bomStageId?: string;
  sampleSize: number;
  /** R2-233: with `qc.aql_level` set, the lot size picks the Z1.4 sample size and Ac/Re. Without it, the stored thresholds apply. */
  lotSize?: number;
  defects: AqlDefectLine[];
  notes?: string;
}): Promise<{ check: Awaited<ReturnType<typeof db.misQcCheck.create>>; result: AqlResult }> {
  const actor = await requirePermission('qc.write');

  // R3-QCR B72: refuse nonsense before anything is written.
  if (!Number.isInteger(input.sampleSize) || input.sampleSize < 1) throw new Error('Sample size must be a whole number of at least 1');
  for (const line of input.defects) {
    if (!Number.isFinite(line.qty) || line.qty < 0) throw new Error('Defect quantity must be 0 or more');
  }
  if (input.lotSize != null && (!Number.isInteger(input.lotSize) || input.lotSize < 1)) throw new Error('Lot size must be a whole number of at least 1');
  // R2-314: major and minor defects follow their own acceptable-quality limits.
  const plans = input.lotSize != null ? await resolveAqlPlans((key) => getRuleValue(key), input.lotSize) : null;
  const thresholds = plans ? thresholdsFromPlan(plans.major, plans.minor) : await getAqlThresholds();
  if (input.sampleSize < thresholds.sampleSize) throw new Error(`Sample too small: inspect at least ${thresholds.sampleSize}`);

  const defectTypeIds = input.defects.map((d) => d.defectTypeId);
  const defectTypes = defectTypeIds.length
    ? await db.misDefectType.findMany({ where: { id: { in: defectTypeIds } } })
    : [];
  if (new Set(defectTypeIds).size !== new Set(defectTypes.map((d) => d.id)).size) throw new Error('Unknown defect type');
  const severityById = new Map(defectTypes.map((dt) => [dt.id, dt.severity]));

  const counts = { critical: 0, major: 0, minor: 0 };
  for (const line of input.defects) {
    const severity = severityById.get(line.defectTypeId);
    if (severity === 'CRITICAL') counts.critical += line.qty;
    else if (severity === 'MAJOR') counts.major += line.qty;
    else if (severity === 'MINOR') counts.minor += line.qty;
  }

  const result = evaluateAql(input.sampleSize, counts, thresholds);
  const totalDefectQty = counts.critical + counts.major + counts.minor;

  const check = await db.misQcCheck.create({
    data: {
      orderId: input.orderId,
      bomStageId: input.bomStageId,
      parameterName: 'AQL Sample',
      result: result.decision === 'ACCEPT' ? 'PASS' : 'FAIL',
      defectQty: totalDefectQty,
      notes: input.notes,
      checkById: actor.userId,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'AQL_DECISION',
    entity: 'MisQcCheck',
    entityId: check.id,
    after: {
      decision: result.decision,
      sampleSize: result.sampleSize,
      sampleSizeRequired: result.sampleSizeRequired,
      sampleSizeMet: result.sampleSizeMet,
      breakdown: result.breakdown,
      thresholds: result.thresholds,
      defects: input.defects,
    },
  });

  if (check.result === 'FAIL') await notifyOfDefect(check);

  return { check, result };
}

export async function getQcForOrder(orderId: string) {
  await requirePermission('qc.read');
  const checks = await db.misQcCheck.findMany({
    // R2-34: a voided (deleted) check is kept for the audit trail but never shown or counted.
    where: { orderId, voidedAt: null },
    include: {
      bomStage: { select: { stageName: true } },
    },
    orderBy: { checkTime: 'desc' },
  });
  return withCheckerNames(checks);
}

export async function getQcSummary(orderId: string) {
  await requirePermission('qc.read');
  const checks = await db.misQcCheck.findMany({ where: { orderId, voidedAt: null } });
  const pass = checks.filter(c => c.result === 'PASS').length;
  const fail = checks.filter(c => c.result === 'FAIL').length;
  const na = checks.length - pass - fail;
  // R2-322: labelled "Defects (failed checks)": a FAIL re-passed later on the same stage + parameter
  // (setup waste, since corrected) no longer counts. Same "latest check per key" rule as the order close gate.
  const totalDefectQty = latestChecks(checks).filter(c => c.result === 'FAIL').reduce((s, c) => s + Number(c.defectQty ?? 0), 0);
  return { total: checks.length, pass, fail, na, totalDefectQty };
}

/** The hourly check rhythm the QC home is built around: 09:00 through 16:00. */
export const QC_FIRST_SLOT_HOUR = 9;
export const QC_SLOT_COUNT = 8;

export type QcSlotState = 'pass' | 'fail' | 'makeready' | 'never';

export type QcSlot = {
  hour: number;
  label: string;
  state: QcSlotState;
  checks: number;
};

export type QcCheckRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  parameterName: string;
  result: string;
  defectType: string | null;
  defectQty: number | null;
  notes: string | null;
  checkTime: Date;
};

export type QcTodayBoard = {
  slots: QcSlot[];
  checksToday: number;
  failures: QcCheckRow[];
  alsoToday: QcCheckRow[];
  /** The next slot with nothing recorded. Negative minutes = already overdue. */
  dueSlot: { label: string; minutesAway: number } | null;
};

function toQcRow(c: {
  id: string;
  orderId: string;
  parameterName: string | null;
  result: string;
  defectType: string | null;
  defectQty: unknown;
  notes: string | null;
  checkTime: Date;
  order: { orderNumber: string } | null;
}): QcCheckRow {
  return {
    id: c.id,
    orderId: c.orderId,
    orderNumber: c.order?.orderNumber ?? '—',
    parameterName: c.parameterName ?? 'General',
    result: c.result,
    defectType: c.defectType,
    defectQty: c.defectQty == null ? null : Number(c.defectQty),
    notes: c.notes,
    checkTime: c.checkTime,
  };
}

/**
 * Today's hourly check board.
 *
 * A slot with no row is 'never' — an absence of data, which the grid draws with
 * a dashed border rather than a grey fill. Grey ('makeready') means someone did
 * record something and it was N/A. The two must not look alike.
 *
 * Time is the factory's, never the server's (D22, F-18/F-34): "today" and "which hour" are
 * read against the `factory.timezone` rule, not `getHours()`/`setHours()` on the server's own
 * clock — the database and the plant can sit hours apart, so the server-clock version put a
 * night-shift check in the wrong slot or the wrong day. The query is widened a day either side
 * (`dateKeyToDbDate` is UTC midnight, not the factory's) and the exact cut happens below with
 * `factoryDateKey`/`factoryMinuteOfDay`, the same discipline `getQcHourlyGrid` already uses.
 */
export async function getTodayQcBoard(now: Date = new Date()): Promise<QcTodayBoard> {
  await requirePermission('qc.read');

  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(now, timeZone);

  const checks = await db.misQcCheck.findMany({
    where: {
      checkTime: {
        gte: dateKeyToDbDate(addDaysToDateKey(todayKey, -1)),
        lt: dateKeyToDbDate(addDaysToDateKey(todayKey, 2)),
      },
      voidedAt: null,
    },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { checkTime: 'desc' },
  });
  const todayChecks = checks.filter((c) => factoryDateKey(c.checkTime, timeZone) === todayKey);

  const slots: QcSlot[] = [];
  for (let i = 0; i < QC_SLOT_COUNT; i += 1) {
    const hour = QC_FIRST_SLOT_HOUR + i;
    const inSlot = todayChecks.filter((c) => Math.floor(factoryMinuteOfDay(c.checkTime, timeZone) / 60) === hour);
    let state: QcSlotState = 'never';
    if (inSlot.some((c) => c.result === 'FAIL')) state = 'fail';
    else if (inSlot.some((c) => c.result === 'PASS')) state = 'pass';
    else if (inSlot.length > 0) state = 'makeready';
    slots.push({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      state,
      checks: inSlot.length,
    });
  }

  const nowMinutes = factoryMinuteOfDay(now, timeZone);
  const pending = slots.find((s) => s.state === 'never' && s.hour * 60 + 60 > nowMinutes);
  const dueSlot = pending
    ? { label: pending.label, minutesAway: pending.hour * 60 - nowMinutes }
    : null;

  const rows = todayChecks.map(toQcRow);
  return {
    slots,
    checksToday: todayChecks.length,
    failures: rows.filter((r) => r.result === 'FAIL'),
    alsoToday: rows.filter((r) => r.result !== 'FAIL').slice(0, 5),
    dueSlot,
  };
}

/** Recent failures, for the blocker card on a supervisor or owner home. */
export async function listRecentQcFailures(limit = 5, sinceHours = 24): Promise<QcCheckRow[]> {
  await requirePermission('qc.read');
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
  const checks = await db.misQcCheck.findMany({
    where: { result: 'FAIL', checkTime: { gte: since }, voidedAt: null },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { checkTime: 'desc' },
    take: limit,
  });
  return checks.map(toQcRow);
}
