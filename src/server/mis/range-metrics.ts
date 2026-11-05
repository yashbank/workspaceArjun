/**
 * R8 T4: the dashboard widgets that follow the shared range (`lib/mis/report-range.ts`).
 * Each export is its own gate, so a role that may not read production / QC / orders gets a
 * refusal here, not a number. Quantities only. Wages stay in payroll.ts (wages.read).
 */

import { factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { normaliseUnit, sumByUnit, type QtyByUnit } from '@/lib/mis/qty-by-unit';
import { factoryRangeFromKeys, type KeyRange } from '@/lib/mis/report-range';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getAqlThresholds, getFactoryTimezone } from '@/server/mis/business-rules';

/** Day buckets up to this many days, month buckets beyond (a year is 12 bars, not 365). */
const DAILY_MAX_DAYS = 31;

export type RangeProduction = {
  /** One row per unit: 500 PIECE and 200 KG are two figures, never "700". */
  produced: QtyByUnit[];
  waste: QtyByUnit[];
  machinesRun: number;
  entries: number;
  /** A chart has one axis, so it draws one unit: the one with the most output. */
  seriesUnit: string | null;
  series: { date: string; produced: number; waste: number }[];
  /** Waste in KG only, by the process the entry was booked to; "No phase" when none. */
  wastageByPhase: { phase: string; kg: number }[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Output, waste, machines run, the chart series and waste by phase over the range. */
export async function getRangeProduction(range: KeyRange): Promise<RangeProduction> {
  await requirePermission('production.read');
  const timeZone = await getFactoryTimezone();
  const { from, to } = factoryRangeFromKeys(range.fromKey, range.toKey, timeZone);

  const logs = await db.misProductionLog.findMany({
    where: { loggedAt: { gte: from, lt: to }, voidedAt: null },
    select: {
      loggedAt: true,
      qtyProduced: true,
      qtyWaste: true,
      unit: true,
      machineId: true,
      jobPhase: { select: { process: { select: { name: true } } } },
    },
  });

  const monthly = range.days > DAILY_MAX_DAYS;
  const bucketOf = (key: string) => (monthly ? key.slice(0, 7) : key);
  const labelOf = (b: string) => (monthly ? `${MONTHS[Number(b.slice(5, 7)) - 1]} ${b.slice(2, 4)}` : `${Number(b.slice(8, 10))} ${MONTHS[Number(b.slice(5, 7)) - 1]}`);

  // Every bucket in the range exists, so a quiet day or month is a visible zero on the axis.
  const buckets = new Map<string, { produced: number; waste: number }>();
  for (let t = Date.parse(`${range.fromKey}T00:00:00Z`); t < Date.parse(`${range.toKey}T00:00:00Z`); t += 86_400_000) {
    buckets.set(bucketOf(new Date(t).toISOString().slice(0, 10)), { produced: 0, waste: 0 });
  }

  const byPhase = new Map<string, number>();
  const machines = new Set<string>();
  const produced = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyProduced ?? 0), unit: l.unit })));
  const waste = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyWaste ?? 0), unit: l.unit })));
  const seriesUnit = produced.reduce<QtyByUnit | null>((top, u) => (!top || u.qty > top.qty ? u : top), null)?.unit ?? null;
  for (const l of logs) {
    const p = Number(l.qtyProduced ?? 0);
    const w = Number(l.qtyWaste ?? 0);
    if (l.machineId) machines.add(l.machineId);
    const b = buckets.get(bucketOf(factoryDateKey(l.loggedAt, timeZone)));
    if (b && normaliseUnit(l.unit) === seriesUnit) {
      b.produced += p;
      b.waste += w;
    }
    if (normaliseUnit(l.unit) === 'KG' && w > 0) {
      const phase = l.jobPhase?.process?.name ?? 'No phase';
      byPhase.set(phase, (byPhase.get(phase) ?? 0) + w);
    }
  }

  return {
    produced,
    waste,
    machinesRun: machines.size,
    entries: logs.length,
    seriesUnit,
    series: [...buckets].map(([b, v]) => ({ date: labelOf(b), ...v })),
    wastageByPhase: [...byPhase].map(([phase, kg]) => ({ phase, kg })).sort((a, b) => b.kg - a.kg),
  };
}

export type RangeQc = {
  /** Null when no failed defect was recorded in the range (the widget shows its empty state). */
  aql: { critical: number; major: number; minor: number; /** `aql.read` only (D6): absent, not blank, for any other role. */ ceilings?: { critical: number; major: number; minor: number } } | null;
  /** Failed checks nobody has acknowledged and no later PASS has cleared; all time, not range-bound. */
  defectsOpen: number;
};

/** Failed-defect counts by severity against the AQL ceilings, and the open-defect count. */
export async function getRangeQc(range: KeyRange): Promise<RangeQc> {
  const actor = await requirePermission('qc.read');
  const timeZone = await getFactoryTimezone();
  const { from, to } = factoryRangeFromKeys(range.fromKey, range.toKey, timeZone);

  const [inRange, types, ceilings, open] = await Promise.all([
    db.misQcCheck.findMany({
      where: { checkTime: { gte: from, lt: to }, voidedAt: null, result: 'FAIL', defectType: { not: null } },
      select: { defectType: true, defectQty: true },
    }),
    db.misDefectType.findMany({ select: { code: true, name: true, severity: true } }),
    getAqlThresholds(),
    db.misQcCheck.findMany({
      where: { voidedAt: null, result: { in: ['FAIL', 'PASS'] } },
      orderBy: { checkTime: 'asc' },
      select: { orderId: true, bomStageId: true, parameterName: true, result: true, acknowledgedAt: true },
    }),
  ]);

  const severityOf = new Map<string, string>();
  for (const t of types) {
    severityOf.set(t.code.toLowerCase(), t.severity);
    severityOf.set(t.name.toLowerCase(), t.severity);
  }
  const counts = { critical: 0, major: 0, minor: 0 };
  let matched = 0;
  for (const c of inRange) {
    const sev = severityOf.get((c.defectType ?? '').trim().toLowerCase());
    if (!sev) continue; // free-text defect with no catalogue severity: not counted in an AQL bucket
    matched += 1;
    counts[sev.toLowerCase() as keyof typeof counts] += Number(c.defectQty ?? 1);
  }

  // A FAIL is open until acknowledged or until a later PASS on the same order/stage/parameter.
  const latest = new Map<string, { result: string; acknowledged: boolean }>();
  for (const c of open) {
    latest.set(`${c.orderId}|${c.bomStageId ?? ''}|${c.parameterName ?? ''}`, { result: c.result, acknowledged: c.acknowledgedAt !== null });
  }
  const defectsOpen = [...latest.values()].filter((v) => v.result === 'FAIL' && !v.acknowledged).length;

  return {
    aql:
      matched === 0
        ? null
        : { ...counts, ...(can(actor.role, 'aql.read') ? { ceilings: { critical: ceilings.criticalMax, major: ceilings.majorMax, minor: ceilings.minorMax } } : {}) },
    defectsOpen,
  };
}

export type RangeOnTime = { despatched: number; total: number };

/**
 * Orders due (delivery date) in the range up to today, and how many of them are DELIVERED. Cancelled orders are not
 * counted, nor is an order not due yet. No delivered-at is recorded, so this cannot say a delivery was on time.
 */
export async function getRangeOnTime(range: KeyRange): Promise<RangeOnTime> {
  await requirePermission('orders.read');
  const today = factoryDateKey(new Date(), await getFactoryTimezone());
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const end = tomorrow < range.toKey ? tomorrow : range.toKey;
  const orders = await db.misOrder.findMany({
    where: {
      status: { not: 'CANCELLED' },
      // deliveryDate is a calendar date stored at UTC midnight, so the keys compare directly.
      deliveryDate: { gte: new Date(`${range.fromKey}T00:00:00Z`), lt: new Date(`${end}T00:00:00Z`) },
    },
    select: { status: true },
  });
  return {
    despatched: orders.filter((o) => o.status === 'DELIVERED').length,
    total: orders.length,
  };
}
