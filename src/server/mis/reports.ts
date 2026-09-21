import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { buildWastage, clampWeeks, windowKeys, type WastageReport } from '@/lib/mis/wastage';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

export type ReportRange = { from: Date; to: Date };

// Machine utilisation (E7-11) can now be computed by joining
// MisMachineAllocation to MisOrder/MisJobPhase by id — jobPhaseId landed in
// Phase 9 (MIS-261/265). Not built here; this phase only wires the link.

/** Production summary by order — qty produced, waste, entry count */
export async function getProductionReport(range: ReportRange) {
  await requirePermission('reports.read');
  const logs = await db.misProductionLog.findMany({
    where: { loggedAt: { gte: range.from, lte: range.to } },
    include: {
      order: { select: { orderNumber: true, description: true } },
      machine: { select: { name: true } },
      employee: { select: { name: true } },
    },
    orderBy: { loggedAt: 'desc' },
  });
  // group by order
  const byOrder: Record<string, { orderNumber: string; description: string | null; produced: number; waste: number; entries: number }> = {};
  for (const log of logs) {
    const key = log.orderId;
    if (!byOrder[key]) {
      byOrder[key] = { orderNumber: log.order?.orderNumber ?? '?', description: log.order?.description ?? null, produced: 0, waste: 0, entries: 0 };
    }
    byOrder[key].produced += Number(log.qtyProduced);
    byOrder[key].waste += Number(log.qtyWaste ?? 0);
    byOrder[key].entries += 1;
  }
  return { rows: Object.values(byOrder), raw: logs };
}

/** Attendance summary by employee for a date range */
export async function getAttendanceReport(range: ReportRange) {
  await requirePermission('reports.read');
  const records = await db.misAttendance.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    include: {
      employee: { select: { name: true, employeeCode: true, department: { select: { name: true } } } },
      shift: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
  });
  // group by employee
  const byEmp: Record<string, { name: string; code: string; dept: string; present: number; absent: number; late: number; ot: number }> = {};
  for (const r of records) {
    const key = r.employeeId;
    if (!byEmp[key]) {
      byEmp[key] = {
        name: r.employee?.name ?? '?',
        code: r.employee?.employeeCode ?? '?',
        dept: r.employee?.department?.name ?? '—',
        present: 0, absent: 0, late: 0, ot: 0,
      };
    }
    if (r.status === 'PRESENT') byEmp[key].present++;
    if (r.status === 'ABSENT') byEmp[key].absent++;
    if (r.status === 'LATE') byEmp[key].late++;
    if (r.otMinutes > 0) byEmp[key].ot++;
  }
  return { rows: Object.values(byEmp), raw: records };
}

/** QC summary by order */
export async function getQcReport(range: ReportRange) {
  await requirePermission('reports.read');
  const checks = await db.misQcCheck.findMany({
    where: { checkTime: { gte: range.from, lte: range.to } },
    include: {
      order: { select: { orderNumber: true } },
    },
    orderBy: { checkTime: 'desc' },
  });
  const byOrder: Record<string, { orderNumber: string; pass: number; fail: number; na: number }> = {};
  for (const c of checks) {
    const key = c.orderId;
    if (!byOrder[key]) byOrder[key] = { orderNumber: c.order?.orderNumber ?? '?', pass: 0, fail: 0, na: 0 };
    if (c.result === 'PASS') byOrder[key].pass++;
    else if (c.result === 'FAIL') byOrder[key].fail++;
    else byOrder[key].na++;
  }
  return { rows: Object.values(byOrder), raw: checks };
}

/** Orders status report */
export async function getOrdersReport(range: ReportRange) {
  await requirePermission('reports.read');
  return db.misOrder.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: { customer: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Stock movement by item. `pricePerUnit` is money (D24, F-06): for a role without `wages.read` it is
 * not selected from the database at all, so it is in neither `rows` nor the raw transactions.
 */
export async function getStoreReport(range: ReportRange) {
  const actor = await requirePermission('reports.read');
  const seesPrice = can(actor.role, 'wages.read');

  const txns = await db.misStoreTransaction.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: {
      item: { select: { id: true, name: true, code: true, unit: true, ...(seesPrice ? { pricePerUnit: true } : {}) } },
    },
    orderBy: { createdAt: 'desc' },
  });

  type ItemRow = {
    id: string; name: string; code: string; unit: string;
    /** Present only for a role holding wages.read. */
    pricePerUnit?: number | null; totalIn: number; totalOut: number; txnCount: number;
  };
  const byItem: Record<string, ItemRow> = {};

  for (const t of txns) {
    const key = t.itemId;
    if (!byItem[key]) {
      byItem[key] = {
        id: t.item?.id ?? key,
        name: t.item?.name ?? '—',
        code: t.item?.code ?? '—',
        unit: t.item?.unit ?? '',
        ...(seesPrice ? { pricePerUnit: t.item && 'pricePerUnit' in t.item && t.item.pricePerUnit != null ? Number(t.item.pricePerUnit) : null } : {}),
        totalIn: 0,
        totalOut: 0,
        txnCount: 0,
      };
    }
    if (t.type === 'IN') byItem[key].totalIn += Number(t.quantity);
    else byItem[key].totalOut += Number(t.quantity);
    byItem[key].txnCount++;
  }

  // The select above already leaves the price out; the raw rows are stripped as well so the guarantee
  // does not rest on the query alone.
  return { rows: Object.values(byItem), raw: seesPrice ? txns : withoutMoneyFields(txns) };
}


/**
 * D7's wastage report: waste by phase by week, by machine, and by order — ONE query, and the
 * on-screen numbers and the CSV export both come from it ("the CSV is generated from the query that
 * drew the chart, not a second one").
 *
 * Read from the same production log the phone reports use (`getProductionReport`). Weeks are the
 * factory's (D22). The query is widened by a day either side and the pure builder does the exact
 * factory-date cut, so a log made just after factory midnight is not lost to a UTC boundary.
 * No money: quantities only.
 */
export async function getWastageReport(
  input: { weeks?: unknown; machineId?: unknown; unit?: unknown } = {},
  now: Date = new Date(),
): Promise<WastageReport> {
  await requirePermission('reports.read');

  const weeks = clampWeeks(input.weeks);
  const timeZone = await getFactoryTimezone();
  const lastKey = factoryDateKey(now, timeZone);
  const { fromKey } = windowKeys(lastKey, weeks);

  const logs = await db.misProductionLog.findMany({
    where: {
      loggedAt: {
        gte: dateKeyToDbDate(addDaysToDateKey(fromKey, -1)),
        lt: dateKeyToDbDate(addDaysToDateKey(lastKey, 2)),
      },
    },
    select: {
      loggedAt: true,
      qtyProduced: true,
      qtyWaste: true,
      unit: true,
      machineId: true,
      machine: { select: { name: true } },
      orderId: true,
      order: { select: { orderNumber: true, description: true } },
      jobPhase: { select: { process: { select: { name: true } } } },
    },
  });

  return buildWastage(
    logs.map((l) => ({
      loggedAt: l.loggedAt,
      qtyProduced: Number(l.qtyProduced ?? 0),
      qtyWaste: Number(l.qtyWaste ?? 0),
      unit: l.unit,
      machineId: l.machineId,
      machineName: l.machine?.name ?? null,
      orderId: l.orderId,
      orderNumber: l.order?.orderNumber ?? '?',
      description: l.order?.description ?? null,
      phaseName: l.jobPhase?.process?.name ?? null,
    })),
    // A query string can carry a repeated parameter (an array); only a plain string is a filter.
    { timeZone, lastKey, weeks, unit: typeof input.unit === 'string' ? input.unit : null, machineId: typeof input.machineId === 'string' ? input.machineId : null },
  );
}
