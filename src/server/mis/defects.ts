/**
 * D14's defects and rework: what QC logged as FAIL, sorted, cut at 80% and traced.
 *
 * A second view of the checks the phone QC layer already records (`MisQcCheck`, `result = 'FAIL'`), same
 * `qc.read` gate, same factory zone (D22). Checker names come from the phone layer's own `withCheckerNames`.
 * What no table records — a disposition (reworked / scrapped / accepted with deviation), rework time, a batch,
 * a unit for the defect quantity, a rupee cost — is not computed and not in this payload. **No money.**
 */

import { shiftMonth } from '@/lib/mis/attendance-month';
import { buildDefectReport, type Booking, type DefectReportView } from '@/lib/mis/defects';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { withCheckerNames } from '@/server/mis/qc';

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export async function getDefectReport(
  input: { month?: unknown; machine?: unknown; severity?: unknown } = {},
  now: Date = new Date(),
): Promise<DefectReportView> {
  const actor = await requirePermission('qc.read');

  const timeZone = await getFactoryTimezone();
  const currentKey = factoryDateKey(now, timeZone).slice(0, 7);
  const asked = asString(input.month);
  const monthKey = asked && MONTH_KEY.test(asked) ? (asked > currentKey ? currentKey : asked) : currentKey;

  const first = `${monthKey}-01`;
  const last = `${monthKey}-${String(new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

  // Over-fetch a day either side; the pure builder cuts the month exactly on the factory date.
  const fails = await db.misQcCheck.findMany({
    where: { result: 'FAIL', checkTime: { gte: dateKeyToDbDate(addDaysToDateKey(first, -1)), lt: dateKeyToDbDate(addDaysToDateKey(last, 2)) } },
    select: { id: true, orderId: true, checkTime: true, checkById: true, defectType: true, defectQty: true, notes: true, parameterName: true },
    orderBy: { checkTime: 'desc' },
  });
  const named = await withCheckerNames(fails);
  const orderIds = [...new Set(fails.map((c) => c.orderId))];

  const [orders, masters, allocations, shifts] = await Promise.all([
    orderIds.length ? db.misOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true } }) : [],
    db.misDefectType.findMany({ select: { id: true, code: true, name: true, severity: true } }),
    orderIds.length
      ? db.misMachineAllocation.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, startsAt: true, endsAt: true, releasedAt: true, machine: { select: { name: true } } } })
      : [],
    db.misShift.findMany({ where: { isActive: true }, select: { name: true, startTime: true, endTime: true }, orderBy: { startTime: 'asc' } }),
  ]);
  const numberOf = new Map(orders.map((o) => [o.id, o.orderNumber]));

  const bookings: Booking[] = [];
  for (const a of allocations) {
    if (a.orderId === null) continue;
    // A released booking ends when it was released, not when it was planned to.
    bookings.push({ orderId: a.orderId, machine: a.machine.name, from: a.startsAt, to: a.releasedAt && a.releasedAt < a.endsAt ? a.releasedAt : a.endsAt });
  }

  const report = buildDefectReport({
    checks: named.map((c) => ({
      id: c.id,
      orderId: c.orderId,
      orderNumber: numberOf.get(c.orderId) ?? '—',
      checkTime: c.checkTime,
      defectType: c.defectType,
      defectQty: c.defectQty == null ? null : Number(c.defectQty),
      notes: c.notes,
      parameterName: c.parameterName,
      checkerName: c.checkBy?.name ?? null,
    })),
    masters,
    bookings,
    shifts,
    timeZone,
    monthKey,
    // Only a real severity is a filter; anything else is ignored rather than filtering the month to nothing.
    filters: { machine: asString(input.machine), severity: (['CRITICAL', 'MAJOR', 'MINOR', 'UNCLASSIFIED'] as const).find((s) => s === asString(input.severity)) ?? null },
  });

  return {
    ...report,
    running: monthKey === currentKey,
    prevKey: shiftMonth(monthKey, -1),
    nextKey: shiftMonth(monthKey, 1) <= currentKey ? shiftMonth(monthKey, 1) : null,
    currentKey,
    canWrite: can(actor.role, 'qc.write'),
  };
}
