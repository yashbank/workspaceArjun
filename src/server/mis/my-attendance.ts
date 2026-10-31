import { resolveMonth, parseMonthKey } from '@/lib/mis/attendance-month';
import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { summariseMyMonth, type MyDay, type MySummary } from '@/lib/mis/my-attendance';
import { getCurrentUser } from '@/server/auth';
import { db } from '@/server/db';

import { MisForbiddenError } from './auth';
import { getFactoryTimezone } from './business-rules';

/**
 * R2-172 — a person's OWN attendance for a month. Like "My payslips", the employee id comes from the login, never
 * from the request, so nobody can read another person's register through this door. Hours and punches only: no wage.
 */
export type MyAttendanceMonth = { monthKey: string; employeeName: string; days: MyDay[]; summary: MySummary; timeZone: string };

export async function getMyAttendanceMonth(requestedMonth?: unknown): Promise<MyAttendanceMonth> {
  const user = await getCurrentUser();
  if (!user) throw new MisForbiddenError('attendance.read', 'own attendance');
  const me = await db.misEmployee.findUnique({
    where: { userProfileId: user.id },
    select: { id: true, name: true, isActive: true, deletedAt: true },
  });
  if (!me || me.deletedAt || !me.isActive) throw new MisForbiddenError('attendance.read', 'own attendance');

  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(new Date(), timeZone);
  // The current month by default (the point is to check this month's punches); never a future month.
  const current = todayKey.slice(0, 7);
  const asked = parseMonthKey(requestedMonth);
  const monthKey = asked === null ? current : resolveMonth(asked, todayKey).key;
  const [y, m] = monthKey.split('-').map(Number);
  const nextKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const rows = await db.misAttendance.findMany({
    where: { employeeId: me.id, date: { gte: dateKeyToDbDate(`${monthKey}-01`), lt: dateKeyToDbDate(`${nextKey}-01`) } },
    select: { date: true, status: true, clockIn: true, clockOut: true, lateMinutes: true, otMinutes: true },
    orderBy: { date: 'asc' },
  });
  const days: MyDay[] = rows.map((r) => ({
    dateKey: r.date.toISOString().slice(0, 10), status: r.status, clockIn: r.clockIn, clockOut: r.clockOut, lateMinutes: r.lateMinutes, otMinutes: r.otMinutes,
  }));
  return { monthKey, employeeName: me.name, days, summary: summariseMyMonth(days), timeZone };
}
