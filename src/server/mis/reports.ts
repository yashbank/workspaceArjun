import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { buildMachineUtilisation, type MachineUtilisationReport } from '@/lib/mis/machine-utilisation';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { buildWastage, clampWeeks, windowKeys, type WastageReport } from '@/lib/mis/wastage';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

export type ReportRange = { from: Date; to: Date };

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

/**
 * E7-11's machine utilisation report — how much of `range` each machine was booked for, against
 * an order. Unblocked by Phase 9's `jobPhaseId` wiring; the comment this replaced said so and
 * named the shape ("can now be computed by joining MisMachineAllocation… — not built here").
 *
 * No money (D24): quantities and minutes only.
 */
export async function getMachineUtilisationReport(range: ReportRange): Promise<MachineUtilisationReport> {
  await requirePermission('reports.read');
  const [machines, allocations] = await Promise.all([
    db.misMachine.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    // A simple overlap filter — releasedAt only ever SHORTENS the effective window (never past
    // endsAt), so filtering on endsAt alone cannot drop an allocation the pure builder would
    // still count; the exact clip happens there.
    db.misMachineAllocation.findMany({
      where: { startsAt: { lt: range.to }, endsAt: { gt: range.from } },
      select: { machineId: true, startsAt: true, endsAt: true, releasedAt: true },
    }),
  ]);
  return buildMachineUtilisation({ machines, allocations, range });
}

/**
 * Attendance summary by employee for a date range.
 *
 * F-39/MIS-267: "present" and "late" must agree with this codebase's OTHER two readers of the
 * same `misAttendance` rows, not invent a third definition. `payroll.ts`'s own `present` count
 * is PRESENT + HALF_DAY ("a POLICY, not an attendance fact", its own comment) — a half-day is a
 * paid day, not an absence, so this report must not silently drop it from either total.
 * `attendance.ts`'s own `late` filter is `lateMinutes > 0 || status === 'LATE'` — the
 * punch-derived day-builder marks a day PRESENT even when it carries real `lateMinutes`, so
 * checking the literal status string alone undercounts every late arrival that never got the
 * `LATE` status written.
 */
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
    if (r.status === 'PRESENT' || r.status === 'HALF_DAY') byEmp[key].present++;
    if (r.status === 'ABSENT') byEmp[key].absent++;
    if ((r.lateMinutes ?? 0) > 0 || r.status === 'LATE') byEmp[key].late++;
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

export type BufferDriftBucket = { valueReceived: number; grnItemCount: number };

/**
 * D1's buffer-drift report: value received into the general pool (`BUFFER_STOCK` POs) against
 * value received straight against an order (`FOR_ORDER` POs), for the same period — so a
 * growing gap between the two ("drift") is visible. This does not invent a cost-allocation rule
 * the rest of the system doesn't have yet: `commitReceipt` posts every delivery to the same
 * ledger regardless of purpose (Phase 20's own finding) — this is a reporting VIEW over receipts,
 * bucketed by each PO's own `purpose` column (D1's own prerequisite for this report), so every
 * GRN line lands in exactly one bucket, never a third "unassigned" group. All money: wages.read.
 */
export async function getBufferDriftReport(range: ReportRange) {
  await requirePermission('wages.read');
  const grnItems = await db.misGrnItem.findMany({
    where: { grn: { receivedAt: { gte: range.from, lte: range.to } } },
    include: { poItem: { select: { ratePerUnit: true, po: { select: { purpose: true } } } } },
  });

  const buckets: { BUFFER_STOCK: BufferDriftBucket; FOR_ORDER: BufferDriftBucket } = {
    BUFFER_STOCK: { valueReceived: 0, grnItemCount: 0 },
    FOR_ORDER: { valueReceived: 0, grnItemCount: 0 },
  };
  for (const gi of grnItems) {
    // A legacy PO with no `purpose` written yet reads as buffer stock, matching lib/mis/po-purpose.ts.
    const purpose = gi.poItem?.po?.purpose ?? 'BUFFER_STOCK';
    const value = gi.receivedQty.toNumber() * (gi.poItem?.ratePerUnit.toNumber() ?? 0);
    buckets[purpose].valueReceived += value;
    buckets[purpose].grnItemCount += 1;
  }
  return {
    bufferStock: buckets.BUFFER_STOCK,
    forOrder: buckets.FOR_ORDER,
    drift: buckets.BUFFER_STOCK.valueReceived - buckets.FOR_ORDER.valueReceived,
  };
}
