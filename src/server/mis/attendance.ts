import { db } from '@/server/db';
import { requirePermission, type MisActor } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getCorrectionWindowDays, getFactoryTimezone } from '@/server/mis/business-rules';
import { deriveDays, isWithinCorrectionWindow } from '@/lib/mis/attendance-day';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey, zonedParts } from '@/lib/mis/factory-time';
import { resolveShiftAt } from '@/lib/mis/shift-window';
import { LATENESS_WAIVED_NOTE } from '@/lib/mis/punch-minutes';
import { HALF_DAY_LEAVE, isRequestableLeaveType, leaveCoversDayWhere, leaveRangesOverlap, leaveWorkingDays, validateLeaveRange, type RequestableLeaveType } from '@/lib/mis/leave';

/** The factory's today (D22) — never the server's, which is a different day for 2.5 hours a night. */
async function today(): Promise<string> {
  return factoryDateKey(new Date(), await getFactoryTimezone());
}

/**
 * The day's register, deliberately NOT narrowed to the caller's pool.
 *
 * `resolveVisibleAttendanceWhere` in `visibility.ts` exists and is tested, and
 * composing it here is a one-line change — but it is not made yet on purpose.
 * D4 settles which *people* a user sees and says nothing about the register,
 * while the approved attendance-operator home (`MIS_UI_SPEC.md` §4.6) shows
 * counts for the whole factory. An operator manages nobody, so narrowing this
 * would hand them a register of one and contradict a signed-off screen.
 *
 * See the Phase 2 report for the open decision this is waiting on.
 */
export async function listAttendance(date?: string) {
  await requirePermission('attendance.read');
  const d = date ?? (await today());
  return db.misAttendance.findMany({
    where: { date: new Date(d) },
    include: { employee: { select: { id: true, name: true, employeeCode: true, role: true } }, shift: true },
    orderBy: { employee: { name: 'asc' } },
  });
}

/**
 * R2-94/95: the active roster with NO register row for `date` — the people the day's register cannot show because
 * nobody punched them in. The operator needs them to clock in by hand or mark them absent in bulk.
 */
export async function listUnrecordedEmployees(date?: string) {
  await requirePermission('attendance.read');
  const d = date ?? (await today());
  return db.misEmployee.findMany({
    where: { isActive: true, deletedAt: null, attendance: { none: { date: new Date(d) } } },
    select: { id: true, name: true, employeeCode: true, role: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * The raw punch log behind one employee's one day (K9) — which device recorded each
 * punch and, since the Android kiosk's operator sign-in (2026-09-29,
 * docs/KIOSK_OPERATOR_SIGNIN_2026-09-29.md), which employee was signed in as the
 * kiosk operator when it was confirmed. D21 made `operatorId` optional and it stays
 * so here: a punch from before this feature, or from the portal, just shows none.
 *
 * There is no stored link from a day row back to "its" punches — the day is
 * DERIVED from punches (attendance-day.ts), not the other way round — so this reuses
 * the exact same `deriveDays` grouping the write path uses, over a wide-enough
 * window either side of `date` to catch a shift that wraps midnight, rather than a
 * naive same-calendar-day query that would silently miss or misattribute punches
 * the same way the kiosk screen's own count did before that was fixed.
 */
export async function listPunchesForDay(employeeId: string, date: string) {
  await requirePermission('attendance.read');
  const [timeZone, shifts] = await Promise.all([getFactoryTimezone(), db.misShift.findMany({ where: { isActive: true } })]);

  const dayStart = dateKeyToDbDate(date);
  const windowStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(dayStart.getTime() + 48 * 60 * 60 * 1000);

  const rows = await db.misAttendancePunch.findMany({
    where: { employeeId, punchedAt: { gte: windowStart, lt: windowEnd } },
    include: { device: { select: { name: true } } },
    orderBy: { punchedAt: 'asc' },
  });

  const days = deriveDays(
    rows.map((p) => ({ id: p.id, direction: p.direction, punchedAt: p.punchedAt, shiftId: p.shiftId })),
    shifts,
    timeZone,
  );
  const punchIds = new Set(days.get(date)?.punchIds ?? []);
  const dayRows = rows.filter((p) => punchIds.has(p.id));

  const operatorIds = [...new Set(dayRows.map((p) => p.operatorId).filter((id): id is string => !!id))];
  const operators = operatorIds.length
    ? await db.misEmployee.findMany({ where: { id: { in: operatorIds } }, select: { id: true, name: true } })
    : [];
  const operatorNames = new Map(operators.map((o) => [o.id, o.name]));

  return dayRows.map((p) => ({
    id: p.id,
    direction: p.direction,
    punchedAt: p.punchedAt,
    deviceName: p.device?.name ?? null,
    fromRevokedDevice: p.fromRevokedDevice,
    operatorName: p.operatorId ? (operatorNames.get(p.operatorId) ?? 'Unknown') : null,
  }));
}

/**
 * The kiosk screen's live poll: same register and gate as `listAttendance`, but the
 * leanest shape possible — no employee/shift join — since this is fetched every
 * ~1.5s while the screen is open, so in/out state updates without a page refresh
 * whichever device (this screen or an Android kiosk tablet) recorded the punch.
 */
export async function listAttendanceLive(date?: string) {
  await requirePermission('attendance.read');
  const d = date ?? (await today());
  return db.misAttendance.findMany({
    where: { date: new Date(d) },
    select: { employeeId: true, clockIn: true, clockOut: true, status: true },
  });
}

/** The statuses a register row may hold (the UI picker, `DAY_FRACTION` in payroll, and the LATE label). */
export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY', 'LATE'] as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar date in `YYYY-MM-DD` form (rejects 2026-02-31). */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const keyOfDbDate = (d: Date) => d.toISOString().slice(0, 10);

/** R3 B62: half-open `[first of month, first of next month)` bounds as `@db.Date` values. */
export function monthBounds(monthKey: string): { gte: Date; lt: Date } {
  const [y, m] = monthKey.split('-').map(Number);
  const nextKey = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { gte: dateKeyToDbDate(`${monthKey}-01`), lt: dateKeyToDbDate(`${nextKey}-01`) };
}

function toMonthKey(a: string | number, month?: number): string {
  if (typeof a === 'string') {
    if (!MONTH_KEY.test(a)) throw new Error('Month must look like 2026-10');
    return a;
  }
  if (!Number.isInteger(a) || !month || month < 1 || month > 12) throw new Error('Month must look like 2026-10');
  return `${a}-${String(month).padStart(2, '0')}`;
}

export async function getMonthlyAttendance(employeeId: string, monthOrYear: string | number, month?: number) {
  await requirePermission('attendance.read');
  const bounds = monthBounds(toMonthKey(monthOrYear, month));
  return db.misAttendance.findMany({
    where: { employeeId, date: bounds },
    orderBy: { date: 'asc' },
  });
}

/** The signed-in user's own employee row id, if they have one (used to stop self-approval). */
async function actorEmployeeId(userId: string): Promise<string | null> {
  const row = await db.misEmployee.findFirst({ where: { userProfileId: userId }, select: { id: true } });
  return row?.id ?? null;
}

export type CloseOverride = { reason: string };

/**
 * R3 B51: the guard every register write passes. The row's day must be inside the correction window and its
 * month must not be CLOSED. Only the OWNER, with a reason of 3+ characters, may write into a closed month;
 * that writes `EDIT_ATTENDANCE_AFTER_CLOSE` and bumps the period's `correctionsAfterClose`.
 */
async function guardRegisterDate(actor: MisActor, dateKey: string, entityId: string, override?: CloseOverride) {
  const [timeZone, windowDays] = await Promise.all([getFactoryTimezone(), getCorrectionWindowDays()]);
  const year = Number(dateKey.slice(0, 4));
  const monthNo = Number(dateKey.slice(5, 7));
  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month: monthNo } } });
  if (period?.status === 'CLOSED') {
    const reason = override?.reason?.trim() ?? '';
    if (actor.role !== 'OWNER' || reason.length < 3) {
      throw new Error(`${year}-${String(monthNo).padStart(2, '0')} payroll is closed. Only the Owner can correct it, with a reason.`);
    }
    await db.misPayrollPeriod.update({ where: { id: period.id }, data: { correctionsAfterClose: period.correctionsAfterClose + 1 } });
    await logAuditEvent({
      actorId: actor.userId,
      action: 'EDIT_ATTENDANCE_AFTER_CLOSE',
      entity: 'MisAttendance',
      entityId,
      after: { date: dateKey, reason },
    });
    return;
  }
  if (!isWithinCorrectionWindow(dateKey, new Date(), windowDays, timeZone)) {
    throw new Error(`Outside the correction window (${windowDays} days)`);
  }
}

async function isMonthClosed(dateKey: string): Promise<boolean> {
  const period = await db.misPayrollPeriod.findUnique({
    where: { year_month: { year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) } },
  });
  return period?.status === 'CLOSED';
}

async function loadRow(attendanceId: string) {
  const row = await db.misAttendance.findUnique({ where: { id: attendanceId } });
  if (!row) throw new Error('Attendance record not found');
  return row;
}

export async function clockIn(employeeId: string, shiftId?: string) {
  const actor = await requirePermission('attendance.write');
  const employee = await db.misEmployee.findFirst({ where: { id: employeeId }, select: { id: true, isActive: true, deletedAt: true } });
  if (!employee) throw new Error('Employee not found');
  if (!employee.isActive || employee.deletedAt) throw new Error('This employee is not active');
  const todayKey = await today();
  const d = dateKeyToDbDate(todayKey);
  const existing = await db.misAttendance.findUnique({ where: { employeeId_date: { employeeId, date: d } } });
  if (existing?.clockIn) throw new Error('Already clocked in today');
  await guardRegisterDate(actor, todayKey, existing?.id ?? `${employeeId}:${todayKey}`);
  const rec = await db.misAttendance.upsert({
    where: { employeeId_date: { employeeId, date: d } },
    create: { employeeId, date: d, shiftId: shiftId ?? null, clockIn: new Date(), status: 'PRESENT' },
    update: { clockIn: new Date(), status: 'PRESENT', shiftId: shiftId ?? null },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'CLOCK_IN', entity: 'MisAttendance', entityId: rec.id, after: rec });
  return rec;
}

export async function clockOut(attendanceId: string) {
  const actor = await requirePermission('attendance.write');
  const row = await loadRow(attendanceId);
  if (!row.clockIn) throw new Error('Not clocked in yet');
  if (row.clockOut) throw new Error('Already clocked out');
  const out = new Date();
  if (out.getTime() <= row.clockIn.getTime()) throw new Error('Clock-out must be after clock-in');
  await guardRegisterDate(actor, keyOfDbDate(row.date), row.id);
  const rec = await db.misAttendance.update({ where: { id: attendanceId }, data: { clockOut: out } });
  await logAuditEvent({ actorId: actor.userId, action: 'CLOCK_OUT', entity: 'MisAttendance', entityId: rec.id, after: rec });
  return rec;
}

export async function approveClockOut(attendanceId: string) {
  const actor = await requirePermission('attendance.write');
  const row = await loadRow(attendanceId);
  if (!row.clockOut) throw new Error('There is no clock-out to approve');
  if ((await actorEmployeeId(actor.userId)) === row.employeeId) throw new Error('You cannot approve your own clock-out');
  await guardRegisterDate(actor, keyOfDbDate(row.date), row.id);
  const rec = await db.misAttendance.update({
    where: { id: attendanceId },
    data: { approvedOut: true, approvedById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'APPROVE_CLOCK_OUT', entity: 'MisAttendance', entityId: rec.id, after: rec });
  return rec;
}

/** The instant at which the factory clock reads `hhmm` on calendar day `dateKey` (the factory's zone, never the server's). */
export function factoryTimeToInstant(dateKey: string, hhmm: string, timeZone: string): Date {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error('Time must look like 09:30');
  const [y, mo, d] = dateKey.split('-').map(Number);
  const wanted = Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2]));
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

export async function editAttendance(
  attendanceId: string,
  data: { status?: string; clockIn?: Date; clockOut?: Date; notes?: string; clockInTime?: string | null; clockOutTime?: string | null },
  override?: CloseOverride,
) {
  const actor = await requirePermission('attendance.write');
  if (data.status !== undefined && !(ATTENDANCE_STATUSES as readonly string[]).includes(data.status)) throw new Error('Unknown status');
  const before = await loadRow(attendanceId);
  const dateKey = keyOfDbDate(before.date);
  await guardRegisterDate(actor, dateKey, before.id, override);
  const { clockInTime, clockOutTime, ...rest } = data;
  const patch: { status?: string; clockIn?: Date | null; clockOut?: Date | null; notes?: string } = { ...rest };
  // R2-96: "HH:MM" on the register day, read in the factory's zone. A blank leaves the punch as it is.
  if (clockInTime || clockOutTime) {
    const timeZone = await getFactoryTimezone();
    if (clockInTime) patch.clockIn = factoryTimeToInstant(dateKey, clockInTime, timeZone);
    if (clockOutTime) {
      let out = factoryTimeToInstant(dateKey, clockOutTime, timeZone);
      const inAt = patch.clockIn ?? before.clockIn;
      if (inAt && out.getTime() <= inAt.getTime()) out = new Date(out.getTime() + 24 * 3600 * 1000); // night shift wraps midnight
      patch.clockOut = out;
    }
  }
  const finalIn = patch.clockIn ?? before.clockIn;
  const finalOut = patch.clockOut ?? before.clockOut;
  if (finalOut && !finalIn) throw new Error('A clock-out needs a clock-in');
  if (finalIn && finalOut && finalOut.getTime() <= finalIn.getTime()) throw new Error('Clock-out must be after clock-in');
  const rec = await db.misAttendance.update({
    where: { id: attendanceId },
    data: { ...patch, editedAt: new Date(), editedById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'EDIT_ATTENDANCE', entity: 'MisAttendance', entityId: rec.id, before, after: rec });
  return rec;
}

/**
 * R2-103: waive today's lateness. Zeroes `lateMinutes` on every late row of the day and records WHY in the notes and
 * the audit log (the reason is mandatory). The note keeps the waiver through later punches.
 */
export async function waiveLateness(reason: string, date?: string) {
  const actor = await requirePermission('attendance.write');
  const why = reason.trim();
  if (why.length < 3) throw new Error('A reason is required to waive lateness');
  const todayKey = await today();
  const key = date ?? todayKey;
  if (!isValidDateKey(key)) throw new Error('Date must look like 2026-10-13');
  if (key > todayKey) throw new Error('Cannot waive lateness for a future date');
  await guardRegisterDate(actor, key, 'waive-lateness');
  const d = dateKeyToDbDate(key);
  const late = await db.misAttendance.findMany({ where: { date: d, lateMinutes: { gt: 0 } } });
  // Deliberately NOT stamped editedAt: that would freeze the day against the rest of its punches (the clock-out and
  // its OT would never land). The waiver note itself guards lateMinutes through re-derivation (attendance-punch.ts);
  // the audit event below names the operator.
  await db.$transaction(async (tx) => {
    for (const row of late) {
      await tx.misAttendance.update({
        where: { id: row.id },
        data: { lateMinutes: 0, notes: [row.notes, `${LATENESS_WAIVED_NOTE} ${why}`].filter(Boolean).join(' | ') },
      });
    }
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'WAIVE_LATENESS',
    entity: 'MisAttendance',
    entityId: 'bulk',
    after: { date: key, reason: why, count: late.length, employeeIds: late.map((r) => r.employeeId) },
  });
  return { count: late.length };
}

export type SkippedAbsent = { employeeId: string; reason: string };

export async function markAbsentBulk(employeeIds: string[], date?: string) {
  const actor = await requirePermission('attendance.write');
  const todayKey = await today();
  const key = date ?? todayKey;
  if (!isValidDateKey(key)) throw new Error('Date must look like 2026-10-13');
  if (key > todayKey) throw new Error('Cannot mark absent for a future date');
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) throw new Error('Select at least one employee');
  await guardRegisterDate(actor, key, 'bulk');

  const people = await db.misEmployee.findMany({
    where: { id: { in: ids }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (people.length !== ids.length) throw new Error('One or more employees were not found or are not active');

  const d = dateKeyToDbDate(key);
  const existing = await db.misAttendance.findMany({ where: { date: d, employeeId: { in: ids } } });
  const byEmp = new Map(existing.map((r) => [r.employeeId, r]));
  const skipped: SkippedAbsent[] = [];
  const toWrite: string[] = [];
  for (const id of ids) {
    const row = byEmp.get(id);
    if (row && (row.clockIn || row.clockOut)) skipped.push({ employeeId: id, reason: 'Has a punch' });
    else if (row?.status === 'LEAVE') skipped.push({ employeeId: id, reason: 'On leave' });
    else if (row?.editedAt) skipped.push({ employeeId: id, reason: 'Edited by hand' });
    else toWrite.push(id);
  }

  const stamp = { editedAt: new Date(), editedById: actor.userId };
  const records = await db.$transaction(async (tx) => {
    const out = [];
    for (const employeeId of toWrite) {
      out.push(
        await tx.misAttendance.upsert({
          where: { employeeId_date: { employeeId, date: d } },
          create: { employeeId, date: d, status: 'ABSENT', ...stamp },
          update: { status: 'ABSENT', ...stamp },
        }),
      );
    }
    return out;
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'MARK_ABSENT_BULK',
    entity: 'MisAttendance',
    entityId: 'bulk',
    after: { date: key, count: toWrite.length, employeeIds: toWrite },
  });
  return { records, skipped };
}

export type SkippedPunch = { employeeId: string; reason: string };

/**
 * R2-165/166: clock several people in (or out) at once. `time` is "HH:MM" on the factory clock; it is optional
 * for today (blank = now) and required for a past day inside the correction window. An explicit time is a hand
 * entry, so it stamps `editedAt` like any other register edit. Anyone it cannot punch is skipped with a reason.
 */
export async function bulkPunch(kind: 'IN' | 'OUT', employeeIds: string[], opts: { date?: string; time?: string | null } = {}) {
  const actor = await requirePermission('attendance.write');
  const [todayKey, timeZone] = await Promise.all([today(), getFactoryTimezone()]);
  const key = opts.date ?? todayKey;
  if (!isValidDateKey(key)) throw new Error('Date must look like 2026-10-13');
  if (key > todayKey) throw new Error('Cannot record a punch for a future date');
  const time = opts.time?.trim() || null;
  if (time !== null && !TIME_OF_DAY.test(time)) throw new Error('Time must look like 09:30');
  if (key !== todayKey && time === null) throw new Error('Enter the time for a past date');
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) throw new Error('Select at least one employee');
  await guardRegisterDate(actor, key, 'bulk-punch');
  const at = time ? factoryTimeToInstant(key, time, timeZone) : new Date();
  if (at.getTime() > Date.now() + 60_000) throw new Error('That time is in the future');

  const people = await db.misEmployee.findMany({ where: { id: { in: ids }, isActive: true, deletedAt: null }, select: { id: true } });
  if (people.length !== ids.length) throw new Error('One or more employees were not found or are not active');
  const d = dateKeyToDbDate(key);
  const existing = await db.misAttendance.findMany({ where: { date: d, employeeId: { in: ids } } });
  const byEmp = new Map(existing.map((r) => [r.employeeId, r]));
  const skipped: SkippedPunch[] = [];
  const toWrite: string[] = [];
  for (const id of ids) {
    const row = byEmp.get(id);
    if (kind === 'IN') {
      if (row?.clockIn) skipped.push({ employeeId: id, reason: 'Already clocked in' });
      else if (row?.status === 'LEAVE') skipped.push({ employeeId: id, reason: 'On leave' });
      else toWrite.push(id);
    } else if (!row?.clockIn) skipped.push({ employeeId: id, reason: 'Not clocked in' });
    else if (row.clockOut) skipped.push({ employeeId: id, reason: 'Already clocked out' });
    else if (at.getTime() <= row.clockIn.getTime()) skipped.push({ employeeId: id, reason: 'Before the clock-in' });
    else toWrite.push(id);
  }
  const stamp = time ? { editedAt: new Date(), editedById: actor.userId } : {};
  const records = await db.$transaction(async (tx) => {
    const out = [];
    for (const employeeId of toWrite) {
      if (kind === 'IN') {
        out.push(
          await tx.misAttendance.upsert({
            where: { employeeId_date: { employeeId, date: d } },
            create: { employeeId, date: d, clockIn: at, status: 'PRESENT', ...stamp },
            update: { clockIn: at, status: byEmp.get(employeeId)?.status === 'HALF_DAY' ? 'HALF_DAY' : 'PRESENT', ...stamp },
          }),
        );
      } else {
        out.push(await tx.misAttendance.update({ where: { id: byEmp.get(employeeId)!.id }, data: { clockOut: at, ...stamp } }));
      }
    }
    return out;
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: kind === 'IN' ? 'BULK_CLOCK_IN' : 'BULK_CLOCK_OUT',
    entity: 'MisAttendance',
    entityId: 'bulk',
    after: { date: key, time, count: toWrite.length, employeeIds: toWrite },
  });
  return { records, skipped };
}

export async function listShifts() {
  await requirePermission('attendance.read');
  return db.misShift.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

/** Every shift, active or not: the Shifts screen needs the inactive ones to offer Activate. */
export async function listAllShifts() {
  await requirePermission('attendance.read');
  return db.misShift.findMany({ orderBy: { name: 'asc' } });
}

export async function saveShift(id: string | null, data: { name: string; startTime: string; endTime: string; isDefault?: boolean }) {
  const actor = await requirePermission('attendance.write');
  const name = (data.name ?? '').trim();
  if (!name) throw new Error('Shift name is required');
  if (!TIME_OF_DAY.test(data.startTime ?? '') || !TIME_OF_DAY.test(data.endTime ?? '')) throw new Error('Times must look like 06:00');
  if (data.startTime === data.endTime) throw new Error('Start and end time cannot be the same');

  const active = await db.misShift.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  if (active.some((s) => s.id !== id && s.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new Error('A shift with this name already exists');
  }
  if (id) {
    const existing = await db.misShift.findUnique({ where: { id } });
    if (!existing) throw new Error('Shift not found');
  }

  const rec = await db.$transaction(async (tx) => {
    if (data.isDefault) await tx.misShift.updateMany({ where: id ? { id: { not: id }, isDefault: true } : { isDefault: true }, data: { isDefault: false } });
    if (id) {
      return tx.misShift.update({
        where: { id },
        data: { name, startTime: data.startTime, endTime: data.endTime, ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}) },
      });
    }
    return tx.misShift.create({ data: { name, startTime: data.startTime, endTime: data.endTime, isDefault: data.isDefault ?? false } });
  });
  await logAuditEvent({ actorId: actor.userId, action: id ? 'UPDATE_SHIFT' : 'CREATE_SHIFT', entity: 'MisShift', entityId: rec.id, after: rec });
  return rec;
}

export async function setShiftActive(id: string, isActive: boolean) {
  const actor = await requirePermission('attendance.write');
  const before = await db.misShift.findUnique({ where: { id } });
  if (!before) throw new Error('Shift not found');
  if (!isActive && before.isDefault) throw new Error('This is the default shift. Make another shift the default first.');
  const rec = await db.misShift.update({ where: { id }, data: { isActive } });
  await logAuditEvent({
    actorId: actor.userId,
    action: isActive ? 'ACTIVATE_SHIFT' : 'DEACTIVATE_SHIFT',
    entity: 'MisShift',
    entityId: id,
    before: { isActive: before.isActive },
    after: { isActive: rec.isActive },
  });
  return rec;
}

/**
 * R2-170: permanently remove a shift nothing refers to. Refused while any attendance row, employee default,
 * production log, line clearance or worker allocation points at it (deactivate it instead), and for the default shift.
 */
export async function deleteShift(id: string) {
  const actor = await requirePermission('attendance.write');
  const shift = await db.misShift.findUnique({ where: { id } });
  if (!shift) throw new Error('Shift not found');
  if (shift.isDefault) throw new Error('This is the default shift. Make another shift the default first.');
  const [attendance, employees, logs, clearances, allocations] = await Promise.all([
    db.misAttendance.count({ where: { shiftId: id } }),
    db.misEmployee.count({ where: { defaultShiftId: id } }),
    db.misProductionLog.count({ where: { shiftId: id } }),
    db.misLineClearance.count({ where: { shiftId: id } }),
    db.misWorkerAllocation.count({ where: { shiftId: id } }),
  ]);
  if (attendance + employees + logs + clearances + allocations > 0) {
    throw new Error('This shift is in use by attendance records or employees. Deactivate it instead of deleting it.');
  }
  await db.misShift.delete({ where: { id } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_SHIFT', entity: 'MisShift', entityId: id, before: shift });
  return { id };
}

export async function getMonthSummary(monthOrYear: string | number, month?: number) {
  await requirePermission('attendance.read');
  const bounds = monthBounds(toMonthKey(monthOrYear, month));
  const records = await db.misAttendance.findMany({
    where: { date: bounds },
    include: { employee: { select: { id: true, name: true, employeeCode: true } } },
  });
  // Group by employee
  const byEmp: Record<string, { employee: (typeof records)[number]['employee']; present: number; absent: number; otMinutes: number; lateMinutes: number }> = {};
  for (const r of records) {
    const eid = r.employeeId;
    if (!byEmp[eid]) byEmp[eid] = { employee: r.employee, present: 0, absent: 0, otMinutes: 0, lateMinutes: 0 };
    if (r.status === 'PRESENT' || r.status === 'HALF_DAY') byEmp[eid].present++;
    else byEmp[eid].absent++;
    byEmp[eid].otMinutes += r.otMinutes;
    byEmp[eid].lateMinutes += r.lateMinutes;
  }
  return Object.values(byEmp);
}

export async function requestLeave(
  employeeId: string,
  date: string,
  reason?: string,
  opts: { endDate?: string | null; leaveType?: string } = {},
) {
  const actor = await requirePermission('attendance.write');
  if (!isValidDateKey(date)) throw new Error('Date must look like 2026-10-13');
  // R2-101: an optional last day (inclusive). Blank or equal to the first day is a single-day leave.
  const endKey = opts.endDate ? opts.endDate : null;
  if (endKey !== null && !isValidDateKey(endKey)) throw new Error('Last day must look like 2026-10-13');
  const rangeError = validateLeaveRange(date, endKey);
  if (rangeError) throw new Error(rangeError);
  // R2-102: CL / SL / EL / LWP / OTHER. Unknown values are refused, not coerced.
  const leaveType: RequestableLeaveType = opts.leaveType === undefined || opts.leaveType === '' ? 'OTHER' : (opts.leaveType as RequestableLeaveType);
  if (!isRequestableLeaveType(leaveType)) throw new Error('Leave type must be CL, SL, EL, LWP, Half-day or Other');
  // R2-167: a half-day leave is one day (0.5 of it), never a range.
  if (leaveType === HALF_DAY_LEAVE && endKey !== null && endKey !== date) throw new Error('A half-day leave is a single day');
  const employee = await db.misEmployee.findFirst({ where: { id: employeeId }, select: { id: true, isActive: true, deletedAt: true } });
  if (!employee || !employee.isActive || employee.deletedAt) throw new Error('Employee not found or not active');
  const d = dateKeyToDbDate(date);
  const clash = await db.misLeaveRequest.findFirst({ where: { employeeId, date: d, status: { in: ['PENDING', 'APPROVED'] } } });
  if (clash) throw new Error('A leave request for this day already exists');
  // R2-101: no two live requests of one person may share a day. A single day is an `endDate` of null.
  const live = await db.misLeaveRequest.findMany({ where: { employeeId, status: { in: ['PENDING', 'APPROVED'] } } });
  const overlapping = live.find((l) =>
    leaveRangesOverlap({ start: date, end: endKey }, { start: keyOfDbDate(l.date), end: l.endDate ? keyOfDbDate(l.endDate) : null }),
  );
  if (overlapping) {
    const first = keyOfDbDate(overlapping.date);
    const last = overlapping.endDate ? keyOfDbDate(overlapping.endDate) : first;
    throw new Error(`This overlaps an existing leave request (${first}${last !== first ? ` to ${last}` : ''})`);
  }
  const rec = await db.misLeaveRequest.create({
    data: {
      employeeId, date: d, reason, status: 'PENDING', leaveType,
      ...(endKey && endKey !== date ? { endDate: dateKeyToDbDate(endKey) } : {}),
    },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'REQUEST_LEAVE', entity: 'MisLeaveRequest', entityId: rec.id, after: rec });
  return rec;
}

export async function approveLeave(leaveId: string, approve: boolean) {
  const actor = await requirePermission('attendance.write');
  const leave = await db.misLeaveRequest.findUnique({ where: { id: leaveId } });
  if (!leave) throw new Error('Leave request not found');
  const decided = 'This leave was already decided';
  if (leave.status !== 'PENDING') throw new Error(decided);
  // R2-167: a half-day leave moves pay, so only the Owner or an Admin decides it (the operator who raised it cannot).
  if (leave.leaveType === HALF_DAY_LEAVE) await requirePermission('approvals.read');
  if ((await actorEmployeeId(actor.userId)) === leave.employeeId) throw new Error('You cannot decide your own leave request');

  const beforeStatus = leave.status;
  const status = approve ? 'APPROVED' : 'REJECTED';
  const approvedAt = new Date();
  const dateKey = keyOfDbDate(leave.date);
  // R2-101: a range marks every working day in it; a single day (endDate null) is itself.
  const days = leaveWorkingDays(dateKey, leave.endDate ? keyOfDbDate(leave.endDate) : null);
  const closedMonths = new Map<string, boolean>();
  if (approve) {
    for (const k of days) {
      const m = k.slice(0, 7);
      if (!closedMonths.has(m)) closedMonths.set(m, await isMonthClosed(k));
    }
  }

  const skippedDates: string[] = [];
  await db.$transaction(async (tx) => {
    const changed = await tx.misLeaveRequest.updateMany({
      where: { id: leaveId, status: 'PENDING' },
      data: { status, approvedById: actor.userId, approvedAt },
    });
    if (changed.count === 0) throw new Error(decided);
    if (!approve) return;
    for (const k of days) {
      const dbDay = dateKeyToDbDate(k);
      // B53: an approved leave is a LEAVE row in the register, unless the day already has real data.
      const row = await tx.misAttendance.findUnique({ where: { employeeId_date: { employeeId: leave.employeeId, date: dbDay } } });
      if (leave.leaveType === HALF_DAY_LEAVE) {
        // R2-167: 0.5 day. The person works the other half, so a punch does not block it; a hand edit or a closed month does.
        if (closedMonths.get(k.slice(0, 7)) || row?.editedAt) {
          skippedDates.push(k);
          continue;
        }
        await tx.misAttendance.upsert({
          where: { employeeId_date: { employeeId: leave.employeeId, date: dbDay } },
          create: { employeeId: leave.employeeId, date: dbDay, status: 'HALF_DAY' },
          update: { status: 'HALF_DAY' },
        });
        continue;
      }
      if (closedMonths.get(k.slice(0, 7)) || row?.clockIn || row?.clockOut || row?.editedAt) {
        skippedDates.push(k);
        continue;
      }
      await tx.misAttendance.upsert({
        where: { employeeId_date: { employeeId: leave.employeeId, date: dbDay } },
        create: { employeeId: leave.employeeId, date: dbDay, status: 'LEAVE' },
        update: { status: 'LEAVE' },
      });
    }
  });
  const rec = { ...leave, status, approvedById: actor.userId, approvedAt, skippedDates };
  await logAuditEvent({
    actorId: actor.userId,
    action: approve ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
    entity: 'MisLeaveRequest',
    entityId: leaveId,
    before: { status: beforeStatus },
    after: { status, skippedDates },
  });
  return rec;
}

/**
 * R2-168: take a leave back. A PENDING request is withdrawn by anyone who may write attendance (the register
 * is untouched). An APPROVED one is revoked by the OWNER only, with a reason, and only while every day it
 * covers is in an open month: a closed month never moves. The rows the approval made go back: a LEAVE row
 * with no punch is removed, a HALF_DAY row with a punch becomes PRESENT. Both are audited.
 */
export async function cancelLeaveRequest(leaveId: string, reason?: string) {
  const actor = await requirePermission('attendance.write');
  const leave = await db.misLeaveRequest.findUnique({ where: { id: leaveId } });
  if (!leave) throw new Error('Leave request not found');
  const why = reason?.trim() ?? '';

  if (leave.status === 'PENDING') {
    const changed = await db.misLeaveRequest.updateMany({ where: { id: leaveId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (changed.count === 0) throw new Error('This leave was already decided');
    await logAuditEvent({
      actorId: actor.userId, action: 'WITHDRAW_LEAVE', entity: 'MisLeaveRequest', entityId: leaveId,
      before: { status: 'PENDING' }, after: { status: 'CANCELLED', ...(why ? { reason: why } : {}) },
    });
    return { id: leaveId, status: 'CANCELLED' as const, revertedDates: [] as string[] };
  }

  if (leave.status !== 'APPROVED') throw new Error('Only a pending or approved leave can be cancelled');
  if (actor.role !== 'OWNER') throw new Error('Only the Owner can revoke an approved leave');
  if (why.length < 3) throw new Error('A reason is required to revoke an approved leave');
  const days = leaveWorkingDays(keyOfDbDate(leave.date), leave.endDate ? keyOfDbDate(leave.endDate) : null);
  for (const k of days) {
    if (await isMonthClosed(k)) throw new Error(`${k.slice(0, 7)} payroll is closed, so this leave cannot be revoked`);
  }
  const revertedDates: string[] = [];
  await db.$transaction(async (tx) => {
    const changed = await tx.misLeaveRequest.updateMany({ where: { id: leaveId, status: 'APPROVED' }, data: { status: 'CANCELLED' } });
    if (changed.count === 0) throw new Error('This leave was already decided');
    for (const k of days) {
      const dbDay = dateKeyToDbDate(k);
      const row = await tx.misAttendance.findUnique({ where: { employeeId_date: { employeeId: leave.employeeId, date: dbDay } } });
      if (!row || (row.status !== 'LEAVE' && row.status !== 'HALF_DAY')) continue;
      if (row.clockIn || row.clockOut) await tx.misAttendance.update({ where: { id: row.id }, data: { status: 'PRESENT' } });
      else await tx.misAttendance.delete({ where: { id: row.id } });
      revertedDates.push(k);
    }
  });
  await logAuditEvent({
    actorId: actor.userId, action: 'REVOKE_LEAVE', entity: 'MisLeaveRequest', entityId: leaveId,
    before: { status: 'APPROVED' }, after: { status: 'CANCELLED', reason: why, revertedDates },
  });
  return { id: leaveId, status: 'CANCELLED' as const, revertedDates };
}

export async function listLeaveRequests(status?: string) {
  await requirePermission('attendance.read');
  return db.misLeaveRequest.findMany({
    where: status ? { status } : undefined,
    include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    orderBy: { date: 'desc' },
  });
}

export type AttendancePerson = {
  id: string;
  name: string;
  employeeCode: string;
  lateMinutes: number;
  clockIn: Date | null;
  clockOut: Date | null;
};

export type DayAttendanceSummary = {
  headcount: number;
  present: number;
  late: number;
  onLeave: number;
  absent: number;
  notClockedOut: AttendancePerson[];
  lateArrivals: AttendancePerson[];
  lastPunchAt: Date | null;
  recorded: boolean;
};

const PRESENT_STATUSES = ['PRESENT', 'HALF_DAY', 'LATE'];

/**
 * One day's attendance as counts, not a roster (design rule: "14/17 · 2 absent
 * · 1 on leave", names one tap away).
 *
 * `recorded` is false when the day has no rows at all — the difference between
 * "nobody came in" and "nobody has entered anything yet", which the card has to
 * say out loud rather than showing a confident 0/70.
 */
/** R2-104 — punch events recorded on the factory's today (in/out each count), not the headcount present. */
export async function countPunchesToday(): Promise<number> {
  await requirePermission('attendance.read');
  const [zone, key] = [await getFactoryTimezone(), await today()];
  const from = new Date(dateKeyToDbDate(key).getTime() - 14 * 3_600_000); // widest UTC offset either side
  const rows = await db.misAttendancePunch.findMany({
    where: { punchedAt: { gte: from, lt: new Date(from.getTime() + 62 * 3_600_000) } },
    select: { punchedAt: true },
  });
  return rows.filter((r) => factoryDateKey(r.punchedAt, zone) === key).length;
}

export async function getDayAttendanceSummary(date?: string): Promise<DayAttendanceSummary> {
  await requirePermission('attendance.read');
  const d = new Date(date ?? (await today()));

  const [headcount, records, leaves] = await Promise.all([
    db.misEmployee.count({ where: { deletedAt: null, isActive: true } }),
    db.misAttendance.findMany({
      where: { date: d },
      include: { employee: { select: { id: true, name: true, employeeCode: true } } },
      orderBy: { clockIn: 'asc' },
    }),
    db.misLeaveRequest.findMany({
      where: { ...leaveCoversDayWhere(d), status: 'APPROVED' },
      select: { employeeId: true },
    }),
  ]);

  const toPerson = (r: (typeof records)[number]): AttendancePerson => ({
    id: r.id,
    name: r.employee?.name ?? '—',
    employeeCode: r.employee?.employeeCode ?? '—',
    lateMinutes: r.lateMinutes ?? 0,
    clockIn: r.clockIn,
    clockOut: r.clockOut,
  });

  const onLeaveIds = new Set(leaves.map((l) => l.employeeId));
  for (const r of records) if (r.status === 'LEAVE') onLeaveIds.add(r.employeeId);

  const presentRecords = records.filter(
    (r) => !onLeaveIds.has(r.employeeId) && (r.clockIn !== null || PRESENT_STATUSES.includes(r.status)),
  );
  const present = presentRecords.length;
  const onLeave = onLeaveIds.size;
  const late = presentRecords.filter((r) => r.lateMinutes > 0 || r.status === 'LATE').length;

  const punches = records
    .flatMap((r) => [r.clockIn, r.clockOut])
    .filter((t): t is Date => t instanceof Date);
  const lastPunchAt = punches.length
    ? punches.reduce((a, b) => (a.getTime() > b.getTime() ? a : b))
    : null;

  return {
    headcount,
    present,
    late,
    onLeave,
    absent: Math.max(0, headcount - present - onLeave),
    notClockedOut: presentRecords
      .filter((r) => r.clockIn !== null && r.clockOut === null)
      .map(toPerson),
    lateArrivals: presentRecords
      .filter((r) => r.lateMinutes > 0 || r.status === 'LATE')
      .sort((a, b) => (b.lateMinutes ?? 0) - (a.lateMinutes ?? 0))
      .slice(0, 5)
      .map(toPerson),
    lastPunchAt,
    recorded: records.length > 0,
  };
}

/** Clock-outs a supervisor still has to sign off. Count first, five rows for the card. */
export async function listPendingClockOutApprovals(limit = 5) {
  await requirePermission('attendance.read');
  const where = { clockOut: { not: null }, approvedOut: false } as const;
  const [total, rows] = await Promise.all([
    db.misAttendance.count({ where }),
    db.misAttendance.findMany({
      where,
      include: { employee: { select: { name: true, employeeCode: true } } },
      orderBy: [{ date: 'desc' }, { clockOut: 'desc' }],
      take: limit,
    }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.employee?.name ?? '—',
      employeeCode: r.employee?.employeeCode ?? '—',
      date: r.date,
      clockOut: r.clockOut,
      otMinutes: r.otMinutes ?? 0,
    })),
  };
}

/**
 * How far back a super attendance operator may still correct the register.
 *
 * Driven by the ATTENDANCE_CORRECTION_DAYS business rule so the window is a
 * setting, not a constant compiled into a card. Three days when unset.
 */
export async function getAttendanceCorrectionWindow() {
  await requirePermission('attendance.write');
  const days = await getCorrectionWindowDays();
  // The window is counted in the factory's days (D22), the same days punch ingestion parks against.
  const toKey = await today();
  const to = dateKeyToDbDate(toKey);
  const from = dateKeyToDbDate(addDaysToDateKey(toKey, -(days - 1)));
  return { days, from, to };
}

/**
 * Which shift is on the clock right now.
 *
 * Gated on production.read rather than attendance.read on purpose: this reads
 * the shift *calendar* — which window of the day the factory is in — not any
 * person's attendance. A QC operator needs the shift name in their header and
 * has no business reading the register.
 */
export async function getCurrentShiftName(): Promise<string | null> {
  await requirePermission('production.read');
  const shifts = await db.misShift.findMany({ where: { isActive: true }, orderBy: { startTime: 'asc' } });
  return resolveShiftAt(shifts, new Date(), await getFactoryTimezone())?.name ?? null;
}
