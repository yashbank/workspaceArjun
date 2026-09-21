/**
 * D8's attendance month: every day, every worker, in one query.
 *
 * A second view of the register the phone layer already reads (`MisAttendance`, `MisLeaveRequest`,
 * `MisShift`) — same tables, same `attendance.read` gate, same factory timezone (D22). The phone's
 * `getMonthSummary` and `getMonthlyAttendance` bound the month with the SERVER's local clock (one of
 * the sites Phase 20 sweeps); this reads the month as `@db.Date` keys and finds "today" in the
 * factory's zone, so it is right on a server that is not in India.
 *
 * **Pool.** Like the day register (`listAttendance`), this is deliberately NOT narrowed by D4's people
 * scope: the person running payroll manages nobody, and narrowing would hand them a register of one
 * (the open decision recorded on `listAttendance`). "Pool" here is a department filter.
 *
 * **No money.** Days, statuses, punches and minutes only. `canPayroll` is a flag, never a figure.
 */

import {
  buildMonthMatrix,
  dayDetail,
  dbDateKey,
  resolveMonth,
  shiftMonth,
  type AttendanceMonthView,
  type CellState,
  type DayDetail,
  type EmployeeMonth,
} from '@/lib/mis/attendance-month';
import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export async function getAttendanceMonthView(
  input: { month?: unknown; departmentId?: unknown; employeeId?: unknown; day?: unknown } = {},
  now: Date = new Date(),
): Promise<AttendanceMonthView> {
  const actor = await requirePermission('attendance.read');

  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(now, timeZone);
  const { key: monthKey, running } = resolveMonth(input.month, todayKey);
  const currentKey = todayKey.slice(0, 7);

  const first = `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)).getUTCDate();
  const last = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
  const range = { gte: dateKeyToDbDate(first), lte: dateKeyToDbDate(last) };

  const departments = await db.misDepartment.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const asked = asString(input.departmentId);
  const department = departments.find((d) => d.id === asked) ?? null;

  // People: active, plus anyone with a row this month (someone who left mid-month still has a month).
  const employees = await db.misEmployee.findMany({
    where: {
      deletedAt: null,
      ...(department ? { departmentId: department.id } : {}),
      OR: [{ isActive: true }, { attendance: { some: { date: range } } }],
    },
    select: { id: true, name: true, employeeCode: true, department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const ids = employees.map((e) => e.id);

  const [records, leaves] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db.misAttendance.findMany({
            where: { employeeId: { in: ids }, date: range },
            select: {
              employeeId: true, date: true, status: true, clockIn: true, clockOut: true, otMinutes: true, lateMinutes: true,
              shift: { select: { name: true, startTime: true, endTime: true } },
            },
          }),
          db.misLeaveRequest.findMany({
            where: { employeeId: { in: ids }, status: 'APPROVED', date: range },
            select: { employeeId: true, date: true },
          }),
        ]);

  const keyed = records.map((r) => ({ ...r, dateKey: dbDateKey(r.date) }));
  const matrix = buildMonthMatrix(
    employees.map((e) => ({ id: e.id, name: e.name, code: e.employeeCode, department: e.department?.name ?? null })),
    keyed.map((r) => ({ employeeId: r.employeeId, dateKey: r.dateKey, status: r.status, otMinutes: r.otMinutes })),
    leaves.map((l) => ({ employeeId: l.employeeId, dateKey: dbDateKey(l.date) })),
    monthKey,
  );

  // The person and day the side panels show.
  const wanted = asString(input.employeeId);
  const row = matrix.rows.find((r) => r.employee.id === wanted) ?? matrix.rows[0] ?? null;
  const askedDay = asString(input.day);
  const dayIndex = askedDay ? matrix.days.findIndex((d) => d.key === askedDay) : -1;

  let selected: AttendanceMonthView['selected'] = null;
  if (row) {
    const month: EmployeeMonth = { ...row.counts, days: matrix.days.length };
    let day: DayDetail | null = null;
    let dayState: CellState | null = null;
    if (dayIndex >= 0) {
      dayState = row.cells[dayIndex];
      const rec = keyed.find((r) => r.employeeId === row.employee.id && r.dateKey === matrix.days[dayIndex].key);
      day = rec ? dayDetail({ status: rec.status, clockIn: rec.clockIn, clockOut: rec.clockOut, otMinutes: rec.otMinutes, lateMinutes: rec.lateMinutes, shift: rec.shift }, timeZone) : null;
    }
    selected = { id: row.employee.id, name: row.employee.name, code: row.employee.code, month, dayKey: dayIndex >= 0 ? matrix.days[dayIndex].key : null, day, dayState };
  }

  const next = shiftMonth(monthKey, 1);
  return {
    monthKey,
    running,
    prevKey: shiftMonth(monthKey, -1),
    nextKey: next <= currentKey ? next : null,
    currentKey,
    days: matrix.days,
    departments,
    departmentId: department?.id ?? null,
    departmentName: department?.name ?? null,
    rows: matrix.rows.map((r) => ({ id: r.employee.id, name: r.employee.name, code: r.employee.code, department: r.employee.department, cells: r.cells, counts: r.counts })),
    totals: matrix.totals,
    identityHolds: matrix.identityHolds,
    selected,
    canPayroll: can(actor.role, 'wages.read'),
  };
}
