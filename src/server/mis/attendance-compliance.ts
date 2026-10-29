import { dateKeyToDbDate } from '@/lib/mis/factory-time';
import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import { netWorkedMinutes } from '@/lib/mis/break-minutes';
import { db } from '@/server/db';
import { shouldNotifyOvertime, quarterBounds, complianceFlagsFor, type ComplianceDay } from '@/server/mis/attendance-payroll-rules';
import { getLunchBreakMinutes } from '@/server/mis/business-rules';
import { notifyRoles } from '@/server/mis/notifications';

const DAY_MS = 86_400_000;
const dbKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * R2-212: tell the Supervisor when a clock-out records long overtime. No approval gate - the OT still goes to payroll.
 * Minutes and a name only: no wage figure ever travels in this payload. Best-effort (`notifyRoles` never throws).
 */
export async function notifyLongOvertime(days: Array<{ employeeId: string; workDate: string; otMinutes: number | null | undefined }>): Promise<void> {
  const long = days.filter((d) => shouldNotifyOvertime(d.otMinutes));
  if (long.length === 0) return;
  try {
    const people = await db.misEmployee.findMany({ where: { id: { in: long.map((d) => d.employeeId) } }, select: { id: true, name: true, employeeCode: true } });
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const d of long) {
      const p = byId.get(d.employeeId);
      await notifyRoles(['SUPERVISOR'], NOTIFICATION_TYPES.longOvertime, {
        employeeId: d.employeeId, employeeName: p?.name ?? '', employeeCode: p?.employeeCode ?? '', workDate: d.workDate, otMinutes: d.otMinutes,
      });
    }
  } catch (error) {
    console.error('[mis-notify] long-overtime notice failed', error);
  }
}

/**
 * R2-217: Factories Act warnings per employee for `monthKey` (YYYY-MM). Warn only; labels, never money.
 * Reads from the start of the quarter (OT cap) back-to-Monday of the month's first week through the month's last week.
 */
export async function getComplianceFlags(monthKey: string, employeeIds: string[]): Promise<Record<string, string[]>> {
  if (employeeIds.length === 0) return {};
  const monthStart = `${monthKey}-01`;
  const monthEnd = dbKey(new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)));
  const from = [quarterBounds(monthStart).start, dbKey(new Date(Date.parse(`${monthStart}T00:00:00Z`) - 6 * DAY_MS))].sort()[0];
  const to = dbKey(new Date(Date.parse(`${monthEnd}T00:00:00Z`) + 6 * DAY_MS));
  const [rows, paidLunch] = await Promise.all([
    db.misAttendance.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: dateKeyToDbDate(from), lte: dateKeyToDbDate(to) } },
      select: { employeeId: true, date: true, clockIn: true, clockOut: true, breakOutAt: true, breakInAt: true, otMinutes: true, breaks: { select: { outAt: true, inAt: true } } },
    }),
    getLunchBreakMinutes(),
  ]);
  const byEmployee = new Map<string, ComplianceDay[]>();
  for (const r of rows) {
    const worked = netWorkedMinutes({ clockIn: r.clockIn, clockOut: r.clockOut, breakOut: r.breakOutAt, breakIn: r.breakInAt, breaks: r.breaks }, paidLunch) ?? 0;
    const list = byEmployee.get(r.employeeId) ?? [];
    list.push({ dateKey: dbKey(r.date), workedMinutes: worked, otMinutes: r.otMinutes ?? 0 });
    byEmployee.set(r.employeeId, list);
  }
  const out: Record<string, string[]> = {};
  for (const [id, days] of byEmployee) {
    const flags = complianceFlagsFor(days, monthKey);
    if (flags.length > 0) out[id] = flags;
  }
  return out;
}
