import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, zonedParts } from '@/lib/mis/factory-time';
import { normaliseUnit, sumByUnit } from '@/lib/mis/qty-by-unit';
import { buildMachineUtilisation, type MachineUtilisationReport } from '@/lib/mis/machine-utilisation';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { buildWastage, clampWeeks, windowKeys, type WastageReport } from '@/lib/mis/wastage';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

/** Half-open: every filter below is `gte from, lt to`, so the last instant of a month can never be dropped or double counted (B77). */
export type ReportRange = { from: Date; to: Date };

/**
 * R3-QCR B77: the instant a factory-calendar month starts, and the next month's start, in the factory's
 * zone. A log made at 01:00 IST on 1 Oct is 19:00Z on 30 Sep: it belongs to October.
 */
export function factoryMonthRange(year: number, month: number, timeZone: string): ReportRange {
  const startOf = (y: number, m: number) => {
    // Find the instant whose wall-clock in `timeZone` is the 1st of (y, m) 00:00: guess UTC midnight,
    // measure how far the zone's reading is from it, and shift back (twice, for a DST edge).
    const wanted = Date.UTC(y, m - 1, 1);
    let guess = wanted;
    for (let i = 0; i < 2; i += 1) {
      const p = zonedParts(new Date(guess), timeZone);
      const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      guess += wanted - seen;
    }
    return new Date(guess);
  };
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { from: startOf(year, month), to: startOf(nextYear, nextMonth) };
}

/**
 * R3-QCR B78: `?year` / `?month` are user input. Out of range or not a number falls back to the factory's
 * current month (year 2000..2100, month 1..12 independently).
 */
export function clampReportMonth(
  input: { year?: unknown; month?: unknown },
  todayKey: string,
): { year: number; month: number } {
  const curYear = Number(todayKey.slice(0, 4));
  const curMonth = Number(todayKey.slice(5, 7));
  const asInt = (v: unknown) => (typeof v === 'string' && /^\d{1,4}$/.test(v.trim()) ? parseInt(v.trim(), 10) : NaN);
  const y = asInt(input.year);
  const m = asInt(input.month);
  return {
    year: Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : curYear,
    month: Number.isInteger(m) && m >= 1 && m <= 12 ? m : curMonth,
  };
}

export type ProductionTotal = { unit: string; produced: number; waste: number; wastePct: number | null };

/**
 * Production summary by order and unit — qty produced, waste, entry count.
 * B76: a log row carries ONE unit, so an order's figures are split per unit and `totals` is per unit
 * ("500 PIECE + 200 KG" is two rows, never "700"). Unit text is normalised (trim, upper-case).
 */
export async function getProductionReport(range: ReportRange) {
  await requirePermission('reports.read');
  const logs = await db.misProductionLog.findMany({
    where: { loggedAt: { gte: range.from, lt: range.to } },
    include: {
      order: { select: { orderNumber: true, description: true } },
      machine: { select: { name: true } },
      employee: { select: { name: true } },
    },
    orderBy: { loggedAt: 'desc' },
  });
  // group by order AND unit
  const byOrder: Record<string, { orderNumber: string; description: string | null; unit: string; produced: number; waste: number; entries: number }> = {};
  for (const log of logs) {
    const unit = normaliseUnit(log.unit);
    const key = `${log.orderId}|${unit}`;
    if (!byOrder[key]) {
      byOrder[key] = { orderNumber: log.order?.orderNumber ?? '?', description: log.order?.description ?? null, unit, produced: 0, waste: 0, entries: 0 };
    }
    byOrder[key].produced += Number(log.qtyProduced);
    byOrder[key].waste += Number(log.qtyWaste ?? 0);
    byOrder[key].entries += 1;
  }
  const produced = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyProduced), unit: l.unit })));
  const waste = sumByUnit(logs.map((l) => ({ qty: Number(l.qtyWaste ?? 0), unit: l.unit })));
  const totals: ProductionTotal[] = produced.map((p) => {
    const w = waste.find((x) => x.unit === p.unit)?.qty ?? 0;
    return { unit: p.unit, produced: p.qty, waste: w, wastePct: p.qty > 0 ? Math.round((w / p.qty) * 1000) / 10 : null };
  });
  return { rows: Object.values(byOrder), totals, raw: logs };
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
    // Half-open like every other filter here (B77). `date` is a calendar-day column, so "< to" is written as
    // "<= to - 1 ms": identical for a date, and the shared wage-world fake db (not ours to edit) knows only gte/lte.
    where: { date: { gte: range.from, lte: new Date(range.to.getTime() - 1) } },
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
    where: { checkTime: { gte: range.from, lt: range.to } },
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
    where: { createdAt: { gte: range.from, lt: range.to } },
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
    where: { createdAt: { gte: range.from, lt: range.to } },
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
    where: { grn: { receivedAt: { gte: range.from, lt: range.to } } },
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
