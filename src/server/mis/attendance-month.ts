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
import { dateKeyToDbDate, factoryDateKey, formatFactoryDateTime } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { resolveVisibleEmployeeWhere } from '@/server/mis/visibility';
import { getFactoryTimezone, getLunchBreakMinutes } from '@/server/mis/business-rules';
import { toBreakShapes, unpaidTotalBreakMinutes, type BreakRow } from '@/lib/mis/attendance-breaks';
import { canSeeComplianceFlags, COMPLIANCE_DAILY_LABEL, exceedsDailyLimit, payableWorkedMinutes } from '@/server/mis/attendance-payroll-rules';
import { getComplianceFlags } from '@/server/mis/attendance-compliance';

/** R2-211: the punches stay raw, but time before the shift starts is not worked time (and is never implied overtime). */
function withPayableMinutes(
  base: DayDetail,
  rec: { clockIn: Date | null; clockOut: Date | null; shift: { startTime: string; endTime: string } | null; breakOutAt?: Date | null; breakInAt?: Date | null; breaks?: BreakRow[] },
  workDate: string,
  timeZone: string,
  paidLunch = 0,
): DayDetail {
  // R2-216: all break rows count (legacy pair only when there are none); lunch stays paid up to the allowance.
  const unpaid = unpaidTotalBreakMinutes(rec.breaks, { breakOut: rec.breakOutAt ?? null, breakIn: rec.breakInAt ?? null }, paidLunch);
  base = { ...base, breaks: toBreakShapes(rec.breaks) };
  const payable = payableWorkedMinutes({ workDate, clockIn: rec.clockIn, clockOut: rec.clockOut }, rec.shift, timeZone, unpaid);
  if (payable === null || base.workedMinutes === null || base.shiftMinutes === null) return base;
  const impliedOtMinutes = Math.max(0, payable - base.shiftMinutes);
  return { ...base, workedMinutes: payable, impliedOtMinutes, otAgrees: impliedOtMinutes === base.recordedOtMinutes };
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

export async function getAttendanceMonthView(
  input: { month?: unknown; departmentId?: unknown; employeeId?: unknown; day?: unknown } = {},
  now: Date = new Date(),
): Promise<AttendanceMonthView> {
  const actor = await requirePermission('attendance.read');

  const [timeZone, paidLunch] = await Promise.all([getFactoryTimezone(), getLunchBreakMinutes()]);
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
              breakOutAt: true, breakInAt: true, breaks: { select: { kind: true, outAt: true, inAt: true } },
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

  // R2-217: warn-only compliance flags, for the roles allowed to see them.
  const flagsById = canSeeComplianceFlags(actor.role) ? await getComplianceFlags(monthKey, ids) : {};

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
      day = rec ? withPayableMinutes(dayDetail({ status: rec.status, clockIn: rec.clockIn, clockOut: rec.clockOut, otMinutes: rec.otMinutes, lateMinutes: rec.lateMinutes, shift: rec.shift }, timeZone), rec, matrix.days[dayIndex].key, timeZone, paidLunch) : null;
    }
    const dayFlags = canSeeComplianceFlags(actor.role) && day?.workedMinutes != null && exceedsDailyLimit(day.workedMinutes) ? [COMPLIANCE_DAILY_LABEL] : [];
    selected = { id: row.employee.id, name: row.employee.name, code: row.employee.code, month, dayKey: dayIndex >= 0 ? matrix.days[dayIndex].key : null, day, dayState, dayFlags };
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
    rows: matrix.rows.map((r) => ({ id: r.employee.id, name: r.employee.name, code: r.employee.code, department: r.employee.department, cells: r.cells, counts: r.counts, flags: flagsById[r.employee.id] ?? [] })),
    totals: matrix.totals,
    identityHolds: matrix.identityHolds,
    selected,
    canPayroll: can(actor.role, 'wages.read'),
  };
}

/**
 * R3 B62: the phone register's `?date=` and `?month=` params, made safe. A malformed `date` falls back to the
 * factory's today and a malformed `month` to the factory's current month, so `?date=foo` renders today instead of
 * reaching a query as an Invalid Date. Pure: the caller passes the factory's today key.
 */
export function resolveRegisterQuery(input: { date?: unknown; month?: unknown }, todayKey: string): { date: string; month: string } {
  const asDate = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
  const parsed = asDate ? new Date(`${asDate}T00:00:00Z`) : null;
  const real = parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === asDate;
  const month = typeof input.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(input.month) ? input.month : todayKey.slice(0, 7);
  return { date: real ? (asDate as string) : todayKey, month };
}

/**
 * R3 B64: append a note to a register row. Needs `attendance.note` (not `attendance.write`), changes nothing
 * but `notes`, only for people the actor may see, and never in a closed month.
 */
export async function addAttendanceNote(attendanceId: string, note: string) {
  const actor = await requirePermission('attendance.note');
  const text = (note ?? '').trim();
  if (text.length < 1 || text.length > 500) throw new Error('A note must be 1 to 500 characters');
  const row = await db.misAttendance.findUnique({ where: { id: attendanceId } });
  if (!row) throw new Error('Attendance record not found');
  const visible = await db.misEmployee.findFirst({
    where: { AND: [{ id: row.employeeId }, await resolveVisibleEmployeeWhere(actor)] },
    select: { id: true },
  });
  if (!visible) throw new Error('Attendance record not found');
  const dateKey = row.date.toISOString().slice(0, 10);
  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) } } });
  if (period?.status === 'CLOSED') throw new Error('This month is closed. Notes cannot be added.');

  const me = await db.misEmployee.findFirst({ where: { userProfileId: actor.userId }, select: { name: true } });
  const stamp = formatFactoryDateTime(new Date(), await getFactoryTimezone());
  const line = `[${me?.name ?? 'User'} ${stamp}] ${text}`;
  const notesBefore = row.notes;
  const notes = notesBefore ? `${notesBefore}\n${line}` : line;
  const rec = await db.misAttendance.update({ where: { id: attendanceId }, data: { notes } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'ATTENDANCE_NOTE',
    entity: 'MisAttendance',
    entityId: attendanceId,
    before: { notes: notesBefore },
    after: { notes: rec.notes },
  });
  return rec;
}

