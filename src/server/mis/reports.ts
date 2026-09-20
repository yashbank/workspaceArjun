import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';

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

export async function getStoreReport(range: ReportRange) {
  await requirePermission('reports.read');

  const txns = await db.misStoreTransaction.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: {
      item: { select: { id: true, name: true, code: true, unit: true, pricePerUnit: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  type ItemRow = {
    id: string; name: string; code: string; unit: string;
    pricePerUnit: number | null; totalIn: number; totalOut: number; txnCount: number;
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
        pricePerUnit: t.item?.pricePerUnit != null ? Number(t.item.pricePerUnit) : null,
        totalIn: 0,
        totalOut: 0,
        txnCount: 0,
      };
    }
    if (t.type === 'IN') byItem[key].totalIn += Number(t.quantity);
    else byItem[key].totalOut += Number(t.quantity);
    byItem[key].txnCount++;
  }

  return { rows: Object.values(byItem), raw: txns };
}

