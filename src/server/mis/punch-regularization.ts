import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { NOTIFICATION_TYPES } from '@/lib/mis/notification-copy';
import { punchMinutesNet } from '@/lib/mis/break-minutes';
import { isWithinCorrectionWindow } from '@/lib/mis/attendance-day';
import { resolveLateGrace } from '@/lib/mis/late-rule';
import { isLatenessWaived } from '@/lib/mis/punch-minutes';
import { REGULARIZATION_NOTE_MIN, validateRegularization } from '@/lib/mis/punch-regularization';
import { isUuid } from '@/lib/mis/ids';
import { db } from '@/server/db';
import { factoryTimeToInstant } from '@/server/mis/attendance';
import { logAuditEvent } from '@/server/mis/audit';
import { MisForbiddenError, requirePermission } from '@/server/mis/auth';
import { getCorrectionWindowDays, getFactoryTimezone, getLunchBreakMinutes, getRuleValue } from '@/server/mis/business-rules';
import { notifyRoles } from '@/server/mis/notifications';

/**
 * R2-222 - missed-punch regularization.
 *
 * A worker asks, for their OWN record, to have a past or today's punch fixed. A Supervisor, Admin or Owner
 * (`attendance.regularize`) approves or rejects. Approval writes the register row here, deriving late and OT
 * minutes from the shift exactly as a normal punch does. No wage figure is read, written, audited or notified.
 */

/**
 * Who reviews: exactly Supervisor, Admin and Owner. No dedicated action exists (the permission matrix is pinned by a
 * hand-written test), and `clearance.write` is held by those three roles and no other ("SUPERVISOR and above only").
 */
export const REVIEW_ACTION = 'clearance.write' as const;

/** The register-date guard: not in a closed payroll month, and inside the correction window. */
async function assertDayOpen(dateKey: string) {
  const [timeZone, windowDays] = await Promise.all([getFactoryTimezone(), getCorrectionWindowDays()]);
  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year: Number(dateKey.slice(0, 4)), month: Number(dateKey.slice(5, 7)) } } });
  if (period?.status === 'CLOSED') throw new Error(`${dateKey.slice(0, 7)} payroll is closed, so this day cannot be changed here`);
  if (!isWithinCorrectionWindow(dateKey, new Date(), windowDays, timeZone)) throw new Error(`Outside the correction window (${windowDays} days)`);
}

const keyOfDbDate = (d: Date) => d.toISOString().slice(0, 10);

export type RegularizationRow = {
  id: string;
  employeeId: string;
  workDate: string;
  requestedIn: string | null;
  requestedOut: string | null;
  reason: string;
  status: string;
  decisionNote: string | null;
  createdAt: string;
};

const toRow = (r: {
  id: string; employeeId: string; workDate: Date; requestedIn: Date | null; requestedOut: Date | null;
  reason: string; status: string; decisionNote: string | null; createdAt: Date;
}): RegularizationRow => ({
  id: r.id,
  employeeId: r.employeeId,
  workDate: keyOfDbDate(r.workDate),
  requestedIn: r.requestedIn ? r.requestedIn.toISOString() : null,
  requestedOut: r.requestedOut ? r.requestedOut.toISOString() : null,
  reason: r.reason,
  status: String(r.status),
  decisionNote: r.decisionNote,
  createdAt: r.createdAt.toISOString(),
});

/** The worker raises a request for their own employee record. */
export async function submitPunchRegularization(input: {
  employeeId: string;
  workDate: string;
  requestedIn?: string | null;
  requestedOut?: string | null;
  reason: string;
}) {
  const actor = await requirePermission('attendance.write', undefined, { ownEmployeeId: input.employeeId });
  const timeZone = await getFactoryTimezone();
  const check = validateRegularization(input, factoryDateKey(new Date(), timeZone));
  if (!check.ok) throw new Error(check.error);

  const employee = await db.misEmployee.findFirst({
    where: { id: input.employeeId },
    select: { id: true, name: true, employeeCode: true, isActive: true, deletedAt: true },
  });
  if (!employee || !employee.isActive || employee.deletedAt) throw new Error('Employee not found or not active');

  const date = dateKeyToDbDate(check.workDate);
  const dup = await db.misPunchRegularization.findFirst({ where: { employeeId: employee.id, workDate: date, status: 'PENDING' } });
  if (dup) throw new Error('A request for this day is already waiting for review');

  const rec = await db.misPunchRegularization.create({
    data: {
      employeeId: employee.id,
      workDate: date,
      requestedIn: check.requestedIn ? factoryTimeToInstant(check.workDate, check.requestedIn, timeZone) : null,
      requestedOut: check.requestedOut ? factoryTimeToInstant(check.workDate, check.requestedOut, timeZone) : null,
      reason: check.reason,
      status: 'PENDING',
      requestedBy: actor.userId,
    },
  });
  await logAuditEvent({
    actorId: actor.userId, action: 'REQUEST_PUNCH_REGULARIZATION', entity: 'MisPunchRegularization', entityId: rec.id,
    after: { status: 'PENDING', workDate: check.workDate },
  });
  await notifyRoles(['SUPERVISOR', 'ADMIN'], NOTIFICATION_TYPES.regularizationRaised, {
    requestId: rec.id, employeeName: employee.name, employeeCode: employee.employeeCode, workDate: check.workDate,
  }, actor.userId);
  return toRow(rec);
}

/** The worker takes back their own PENDING request. */
export async function withdrawPunchRegularization(id: string) {
  // Only the person whose record this is may withdraw it; a reviewer rejects instead.
  const actor = await requirePermission(REVIEW_ACTION, undefined, { ownRegularizationId: id });
  if (!isUuid(id)) throw new Error('Request not found');
  const req = await db.misPunchRegularization.findUnique({ where: { id } });
  if (!req) throw new Error('Request not found');
  const me = await db.misEmployee.findFirst({ where: { userProfileId: actor.userId }, select: { id: true } });
  if (me?.id !== req.employeeId) throw new MisForbiddenError(REVIEW_ACTION, 'withdraw');
  if (req.status !== 'PENDING') throw new Error('This request was already decided');
  const changed = await db.misPunchRegularization.updateMany({ where: { id, status: 'PENDING' }, data: { decisionNote: 'Withdrawn', status: 'REJECTED', decidedBy: actor.userId, decidedAt: new Date() } });
  if (changed.count === 0) throw new Error('This request was already decided');
  await logAuditEvent({
    actorId: actor.userId, action: 'WITHDRAW_PUNCH_REGULARIZATION', entity: 'MisPunchRegularization', entityId: id,
    before: { status: 'PENDING' }, after: { status: 'REJECTED', withdrawn: true },
  });
  return { id };
}

/** The caller's OWN requests, newest first. Nothing for anyone without an employee record. */
export async function listMyPunchRegularizations(): Promise<RegularizationRow[]> {
  const actor = await requirePermission('attendance.read', undefined, { self: true });
  const me = await db.misEmployee.findFirst({ where: { userProfileId: actor.userId }, select: { id: true } });
  if (!me) return [];
  const rows = await db.misPunchRegularization.findMany({ where: { employeeId: me.id }, orderBy: { createdAt: 'desc' } });
  return rows.map(toRow);
}

export type ReviewRow = RegularizationRow & { employee: { id: string; name: string; employeeCode: string } };

/** The review queue (reviewers only). Pending by default. */
export async function listPunchRegularizations(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' = 'PENDING'): Promise<ReviewRow[]> {
  await requirePermission(REVIEW_ACTION);
  const rows = await db.misPunchRegularization.findMany({
    where: status === 'ALL' ? undefined : { status },
    include: { employee: { select: { id: true, name: true, employeeCode: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return rows.map((r) => ({ ...toRow(r), employee: r.employee }));
}

async function notifyWorker(employeeId: string, payload: Record<string, unknown>) {
  try {
    const emp = await db.misEmployee.findFirst({ where: { id: employeeId }, select: { userProfileId: true } });
    if (!emp?.userProfileId) return;
    await db.notification.create({ data: { userId: emp.userProfileId, type: NOTIFICATION_TYPES.regularizationDecided, payload: payload as never } });
  } catch (error) {
    console.error('[mis-notify] regularization decision notice failed', error);
  }
}

/** Approve (writes the register row) or reject (a note is required). */
export async function decidePunchRegularization(id: string, approve: boolean, note?: string) {
  const actor = await requirePermission(REVIEW_ACTION);
  if (!isUuid(id)) throw new Error('Request not found');
  const req = await db.misPunchRegularization.findUnique({ where: { id } });
  if (!req) throw new Error('Request not found');
  if (req.status !== 'PENDING') throw new Error('This request was already decided');
  const me = await db.misEmployee.findFirst({ where: { userProfileId: actor.userId }, select: { id: true } });
  if (me?.id === req.employeeId) throw new Error('You cannot decide your own request');
  const why = note?.trim() ?? '';
  if (!approve && why.length < REGULARIZATION_NOTE_MIN) throw new Error('Give a reason for rejecting');

  const workDate = keyOfDbDate(req.workDate);
  const decidedAt = new Date();
  let attendanceId: string | null = null;

  if (approve) {
    await assertDayOpen(workDate);
    const [timeZone, paidLunch] = await Promise.all([getFactoryTimezone(), getLunchBreakMinutes()]);
    const dbDay = req.workDate;
    const lateGrace = await resolveLateGrace((key) => getRuleValue(key), (await db.misEmployee.findFirst({ where: { id: req.employeeId }, select: { payType: true } }))?.payType);
    attendanceId = await db.$transaction(async (tx) => {
      const claimed = await tx.misPunchRegularization.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'APPROVED', decidedBy: actor.userId, decidedAt, decisionNote: why || null },
      });
      if (claimed.count === 0) throw new Error('This request was already decided');
      const row = await tx.misAttendance.findUnique({ where: { employeeId_date: { employeeId: req.employeeId, date: dbDay } } });
      if (row?.status === 'LEAVE') throw new Error('That day is recorded as leave; revoke the leave first');
      const clockIn = req.requestedIn ?? row?.clockIn ?? null;
      const clockOut = req.requestedOut ?? row?.clockOut ?? null;
      if (clockOut && !clockIn) throw new Error('A clock-out needs a clock-in');
      if (clockIn && clockOut && clockOut.getTime() <= clockIn.getTime()) throw new Error('Clock-out must be after clock-in');
      const shiftId = row?.shiftId ?? (await tx.misShift.findFirst({ where: { isActive: true, isDefault: true }, select: { id: true } }))?.id ?? null;
      const shift = shiftId ? await tx.misShift.findUnique({ where: { id: shiftId } }) : null;
      const mins = punchMinutesNet({ workDate, clockIn, clockOut, breakOut: row?.breakOutAt ?? null, breakIn: row?.breakInAt ?? null }, shift, timeZone, paidLunch, lateGrace);
      const lateMinutes = row && isLatenessWaived(row.notes) ? row.lateMinutes : (mins.lateMinutes ?? row?.lateMinutes ?? 0);
      const otMinutes = mins.otMinutes ?? row?.otMinutes ?? 0;
      const status = !row || row.status === 'ABSENT' ? 'PRESENT' : row.status;
      const data = { clockIn, clockOut, shiftId, status, lateMinutes, otMinutes, editedAt: decidedAt, editedById: actor.userId };
      const saved = await tx.misAttendance.upsert({
        where: { employeeId_date: { employeeId: req.employeeId, date: dbDay } },
        create: { employeeId: req.employeeId, date: dbDay, ...data },
        update: data,
      });
      await tx.misPunchRegularization.update({ where: { id }, data: { resultingAttendanceId: saved.id } });
      return saved.id;
    });
  } else {
    const changed = await db.misPunchRegularization.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedBy: actor.userId, decidedAt, decisionNote: why },
    });
    if (changed.count === 0) throw new Error('This request was already decided');
  }

  const status = approve ? 'APPROVED' : 'REJECTED';
  await logAuditEvent({
    actorId: actor.userId, action: approve ? 'APPROVE_PUNCH_REGULARIZATION' : 'REJECT_PUNCH_REGULARIZATION',
    entity: 'MisPunchRegularization', entityId: id,
    before: { status: 'PENDING' }, after: { status, workDate, ...(attendanceId ? { attendanceId } : {}) },
  });
  await notifyWorker(req.employeeId, { requestId: id, decision: status, workDate, note: why });
  return { id, status, attendanceId };
}
