import { evaluateAql, type AqlResult } from '@/lib/mis/aql';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getAqlThresholds } from '@/server/mis/business-rules';

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

export async function addQcCheck(data: {
  orderId: string;
  bomStageId?: string;
  parameterName?: string;
  result: 'PASS' | 'FAIL' | 'NA';
  defectType?: string;
  defectQty?: number;
  notes?: string;
}) {
  const actor = await requirePermission('qc.write');
  const rec = await db.misQcCheck.create({
    data: { ...data, parameterName: data.parameterName ?? 'General', checkTime: new Date(), checkById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_QC_CHECK', entity: 'MisQcCheck', entityId: rec.id, after: rec });
  return rec;
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
  defects: AqlDefectLine[];
  notes?: string;
}): Promise<{ check: Awaited<ReturnType<typeof db.misQcCheck.create>>; result: AqlResult }> {
  const actor = await requirePermission('qc.write');

  const defectTypeIds = input.defects.map((d) => d.defectTypeId);
  const defectTypes = defectTypeIds.length
    ? await db.misDefectType.findMany({ where: { id: { in: defectTypeIds } } })
    : [];
  const severityById = new Map(defectTypes.map((dt) => [dt.id, dt.severity]));

  const counts = { critical: 0, major: 0, minor: 0 };
  for (const line of input.defects) {
    const severity = severityById.get(line.defectTypeId);
    if (severity === 'CRITICAL') counts.critical += line.qty;
    else if (severity === 'MAJOR') counts.major += line.qty;
    else if (severity === 'MINOR') counts.minor += line.qty;
  }

  const thresholds = await getAqlThresholds();
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

  return { check, result };
}

export async function getQcForOrder(orderId: string) {
  await requirePermission('qc.read');
  const checks = await db.misQcCheck.findMany({
    where: { orderId },
    include: {
      bomStage: { select: { stageName: true } },
    },
    orderBy: { checkTime: 'desc' },
  });
  return withCheckerNames(checks);
}

export async function getQcSummary(orderId: string) {
  await requirePermission('qc.read');
  const checks = await db.misQcCheck.findMany({ where: { orderId } });
  const pass = checks.filter(c => c.result === 'PASS').length;
  const fail = checks.filter(c => c.result === 'FAIL').length;
  const totalDefectQty = checks.filter(c => c.result === 'FAIL').reduce((s, c) => s + Number(c.defectQty ?? 0), 0);
  return { total: checks.length, pass, fail, totalDefectQty };
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
 */
export async function getTodayQcBoard(): Promise<QcTodayBoard> {
  await requirePermission('qc.read');

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const checks = await db.misQcCheck.findMany({
    where: { checkTime: { gte: start, lt: end } },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { checkTime: 'desc' },
  });

  const slots: QcSlot[] = [];
  for (let i = 0; i < QC_SLOT_COUNT; i += 1) {
    const hour = QC_FIRST_SLOT_HOUR + i;
    const inSlot = checks.filter((c) => c.checkTime.getHours() === hour);
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

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const pending = slots.find((s) => s.state === 'never' && s.hour * 60 + 60 > nowMinutes);
  const dueSlot = pending
    ? { label: pending.label, minutesAway: pending.hour * 60 - nowMinutes }
    : null;

  const rows = checks.map(toQcRow);
  return {
    slots,
    checksToday: checks.length,
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
    where: { result: 'FAIL', checkTime: { gte: since } },
    include: { order: { select: { orderNumber: true } } },
    orderBy: { checkTime: 'desc' },
    take: limit,
  });
  return checks.map(toQcRow);
}
