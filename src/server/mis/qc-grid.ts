/**
 * D9's whole-floor QC grid: every running line, every hour of the shift, in one query per table.
 *
 * A second view of the checks the phone QC layer already records (`MisQcCheck`) — same table, same
 * `qc.read` gate. The phone `getTodayQcBoard` cannot be reused for this: it fixes the hours at 09–16 and
 * reads them with the server's clock, and D9 says the columns come from the shift definition and the
 * hours from the factory's zone (D22).
 *
 * **AQL limits (D6).** The AQL panel's thresholds are `aql.read` — the Owner's. For a role without it the
 * panel carries only the verdict and the sample taken; the `limits` key is absent, not blank.
 * **No money** on this screen at all.
 */

import { formatFactoryTime, addDaysToDateKey, dateKeyToDbDate, factoryDateKey, factoryMinuteOfDay } from '@/lib/mis/factory-time';
import { axisMinute, shiftWindow } from '@/lib/mis/machine-timeline';
import { can } from '@/lib/mis/permissions';
import { buildQcGrid, type GridOrder, type QcAqlPanel, type QcGridView } from '@/lib/mis/qc-grid';
import { resolveShiftAt, shiftWrapsMidnight, timeToMinutes } from '@/lib/mis/shift-window';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const DATE_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function getQcHourlyGrid(input: { shiftId?: unknown; date?: unknown } = {}, now: Date = new Date()): Promise<QcGridView> {
  const actor = await requirePermission('qc.read');

  const [shifts, timeZone] = await Promise.all([
    db.misShift.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startTime: true, endTime: true, isDefault: true },
      orderBy: { startTime: 'asc' },
    }),
    getFactoryTimezone(),
  ]);
  const todayKey = factoryDateKey(now, timeZone);
  const base = { shifts: shifts.map(({ id, name, startTime, endTime }) => ({ id, name, startTime, endTime })), todayKey, canWrite: can(actor.role, 'qc.write') };

  // Which shift and which day. Default: the shift running now, on the day it STARTED (an overnight shift
  // still running at 01:00 belongs to yesterday's date).
  const asked = shifts.find((s) => s.id === asString(input.shiftId));
  const shift = asked ?? resolveShiftAt(shifts, now, timeZone);
  if (!shift) return { ...base, shift: null, dateKey: null, status: null, grid: null, aql: null };

  const startedYesterday = shiftWrapsMidnight(shift) && factoryMinuteOfDay(now, timeZone) < timeToMinutes(shift.endTime);
  const askedDate = asString(input.date);
  const currentKey = startedYesterday ? addDaysToDateKey(todayKey, -1) : todayKey; // the instance running (or last run) now
  const dateKey = askedDate && DATE_KEY.test(askedDate) && askedDate <= todayKey ? askedDate : currentKey;

  const window = shiftWindow({ startMinute: timeToMinutes(shift.startTime), endMinute: timeToMinutes(shift.endTime) });
  const nowAxis = axisMinute(now, dateKey, timeZone);
  const status = nowAxis < window.from ? 'upcoming' : nowAxis >= window.to ? 'closed' : 'running';

  // Over-fetch either side; the pure builder does the exact cut on the shift's own axis.
  const checks = await db.misQcCheck.findMany({
    where: { checkTime: { gte: dateKeyToDbDate(addDaysToDateKey(dateKey, -1)), lt: dateKeyToDbDate(addDaysToDateKey(dateKey, 3)) } },
    select: { id: true, orderId: true, bomStageId: true, parameterName: true, result: true, defectType: true, defectQty: true, notes: true, checkTime: true },
    orderBy: { checkTime: 'asc' },
  });
  const inWindow = checks.filter((c) => {
    const a = axisMinute(c.checkTime, dateKey, timeZone);
    return a >= window.from && a < window.to;
  });

  // A line is an order that was BOOKED on a machine during the shift (that is what "running" means for a day
  // you are looking back at), plus anything checked in the window, plus — for the current shift only — an order in
  // production with no booking. The booking is also where the machine comes from: a check belongs to an order.
  const allocations = await db.misMachineAllocation.findMany({
    where: {
      orderId: { not: null },
      releasedAt: null,
      startsAt: { lt: dateKeyToDbDate(addDaysToDateKey(dateKey, 2)) },
      endsAt: { gte: dateKeyToDbDate(addDaysToDateKey(dateKey, -1)) },
    },
    select: { orderId: true, startsAt: true, endsAt: true, machine: { select: { name: true } } },
  });
  const machinesOf = new Map<string, Set<string>>();
  const runsOf = new Map<string, { from: number; to: number }[]>();
  const bookedAnywhere = new Set<string>();
  for (const a of allocations) {
    if (!a.orderId) continue;
    bookedAnywhere.add(a.orderId);
    const from = axisMinute(a.startsAt, dateKey, timeZone);
    const to = axisMinute(a.endsAt, dateKey, timeZone);
    if (to <= window.from || from >= window.to) continue; // not this shift
    machinesOf.set(a.orderId, (machinesOf.get(a.orderId) ?? new Set()).add(a.machine.name));
    runsOf.set(a.orderId, [...(runsOf.get(a.orderId) ?? []), { from, to }]);
  }

  const orders = await db.misOrder.findMany({
    where: {
      OR: [
        ...(dateKey >= currentKey ? [{ status: 'IN_PRODUCTION' as const }] : []), // not when looking back
        { id: { in: [...new Set([...inWindow.map((c) => c.orderId), ...runsOf.keys()])] } },
      ],
    },
    select: { id: true, orderNumber: true, description: true },
  });

  const gridOrders: GridOrder[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    description: o.description,
    machines: [...(machinesOf.get(o.id) ?? [])].sort(),
    // Booked, but not in this shift → nothing is due (`[]`). Never booked → unknown run window (undefined): all due.
    runs: runsOf.get(o.id) ?? (bookedAnywhere.has(o.id) ? [] : undefined),
  }));
  const grid = buildQcGrid({
    orders: gridOrders,
    checks: checks.map((c) => ({ ...c, defectQty: c.defectQty == null ? null : Number(c.defectQty) })),
    shift,
    dateKey,
    timeZone,
    now,
  });

  // The latest AQL decision in the window. The verdict is the check's own result; the sample and the limits
  // it was judged against exist only in the decision's audit snapshot.
  const latestAql = [...inWindow].reverse().find((c) => c.parameterName === 'AQL Sample') ?? null;
  let aql: QcAqlPanel | null = null;
  if (latestAql) {
    const snapshot = await db.misAuditLog.findFirst({ where: { action: 'AQL_DECISION', entityId: latestAql.id }, select: { after: true } });
    const after = (snapshot?.after ?? null) as Record<string, unknown> | null;
    const breakdown = Array.isArray(after?.breakdown)
      ? (after!.breakdown as Record<string, unknown>[]).map((l) => ({ severity: String(l.severity), found: num(l.found) ?? 0, max: num(l.max) ?? 0, exceeded: l.exceeded === true }))
      : [];
    aql = {
      orderNumber: orders.find((o) => o.id === latestAql.orderId)?.orderNumber ?? '—',
      decision: after?.decision === 'REJECT' || (after === null && latestAql.result === 'FAIL') ? 'REJECT' : 'ACCEPT',
      sampleSize: num(after?.sampleSize),
      timeLabel: formatFactoryTime(latestAql.checkTime, timeZone),
      ...(can(actor.role, 'aql.read')
        ? { limits: { sampleSizeRequired: num(after?.sampleSizeRequired), sampleSizeMet: typeof after?.sampleSizeMet === 'boolean' ? after.sampleSizeMet : null, breakdown } }
        : {}),
    };
  }

  return { ...base, shift: { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime }, dateKey, status, grid, aql };
}
