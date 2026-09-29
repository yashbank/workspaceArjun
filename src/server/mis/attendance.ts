import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { getCorrectionWindowDays, getFactoryTimezone } from '@/server/mis/business-rules';
import { deriveDays } from '@/lib/mis/attendance-day';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { resolveShiftAt } from '@/lib/mis/shift-window';

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

export async function getMonthlyAttendance(employeeId: string, year: number, month: number) {
  await requirePermission('attendance.read');
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return db.misAttendance.findMany({
    where: { employeeId, date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });
}

export async function clockIn(employeeId: string, shiftId?: string) {
  const actor = await requirePermission('attendance.write');
  const d = dateKeyToDbDate(await today());
  const existing = await db.misAttendance.findUnique({ where: { employeeId_date: { employeeId, date: d } } });
  if (existing?.clockIn) throw new Error('Already clocked in today');
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
  const rec = await db.misAttendance.update({
    where: { id: attendanceId },
    data: { clockOut: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'CLOCK_OUT', entity: 'MisAttendance', entityId: rec.id, after: rec });
  return rec;
}

export async function approveClockOut(attendanceId: string) {
  const actor = await requirePermission('attendance.write');
  const rec = await db.misAttendance.update({
    where: { id: attendanceId },
    data: { approvedOut: true, approvedById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'APPROVE_CLOCK_OUT', entity: 'MisAttendance', entityId: rec.id, after: rec });
  return rec;
}

export async function editAttendance(attendanceId: string, data: { status?: string; clockIn?: Date; clockOut?: Date; notes?: string }) {
  const actor = await requirePermission('attendance.write');
  const before = await db.misAttendance.findUnique({ where: { id: attendanceId } });
  const rec = await db.misAttendance.update({
    where: { id: attendanceId },
    data: { ...data, editedAt: new Date(), editedById: actor.userId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'EDIT_ATTENDANCE', entity: 'MisAttendance', entityId: rec.id, before, after: rec });
  return rec;
}

export async function markAbsentBulk(employeeIds: string[], date?: string) {
  const actor = await requirePermission('attendance.write');
  const d = date ? new Date(date) : dateKeyToDbDate(await today());
  const records = await Promise.all(
    employeeIds.map((employeeId) =>
      db.misAttendance.upsert({
        where: { employeeId_date: { employeeId, date: d } },
        create: { employeeId, date: d, status: 'ABSENT' },
        update: { status: 'ABSENT' },
      }),
    ),
  );
  await logAuditEvent({
    actorId: actor.userId,
    action: 'MARK_ABSENT_BULK',
    entity: 'MisAttendance',
    entityId: employeeIds.join(','),
    after: { employeeIds, date: d },
  });
  return records;
}

export async function listShifts() {
  await requirePermission('attendance.read');
  return db.misShift.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
}

export async function saveShift(id: string | null, data: { name: string; startTime: string; endTime: string; isDefault?: boolean }) {
  const actor = await requirePermission('attendance.write');
  if (id) {
    const rec = await db.misShift.update({ where: { id }, data: { name: data.name, startTime: data.startTime, endTime: data.endTime } });
    await logAuditEvent({ actorId: actor.userId, action: 'UPDATE_SHIFT', entity: 'MisShift', entityId: rec.id, after: rec });
    return rec;
  }
  const rec = await db.misShift.create({ data: { name: data.name, startTime: data.startTime, endTime: data.endTime, isDefault: data.isDefault ?? false } });
  await logAuditEvent({ actorId: actor.userId, action: 'CREATE_SHIFT', entity: 'MisShift', entityId: rec.id, after: rec });
  return rec;
}

export async function getMonthSummary(year: number, month: number) {
  await requirePermission('attendance.read');
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const records = await db.misAttendance.findMany({
    where: { date: { gte: start, lte: end } },
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

export async function requestLeave(employeeId: string, date: string, reason?: string) {
  const actor = await requirePermission('attendance.write');
  const rec = await db.misLeaveRequest.create({ data: { employeeId, date: new Date(date), reason, status: 'PENDING' } });
  await logAuditEvent({ actorId: actor.userId, action: 'REQUEST_LEAVE', entity: 'MisLeaveRequest', entityId: rec.id, after: rec });
  return rec;
}

export async function approveLeave(leaveId: string, approve: boolean) {
  const actor = await requirePermission('attendance.write');
  const rec = await db.misLeaveRequest.update({
    where: { id: leaveId },
    data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: actor.userId, approvedAt: new Date() },
  });
  await logAuditEvent({ actorId: actor.userId, action: approve ? 'APPROVE_LEAVE' : 'REJECT_LEAVE', entity: 'MisLeaveRequest', entityId: rec.id, after: rec });
  return rec;
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
      where: { date: d, status: 'APPROVED' },
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
