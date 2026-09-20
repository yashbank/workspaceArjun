import { randomUUID } from 'node:crypto';

import {
  deriveDays,
  isWithinCorrectionWindow,
  planDayUpdates,
  workDateFor,
  type PunchFact,
} from '@/lib/mis/attendance-day';
import { dateKeyToDbDate, formatFactoryTime } from '@/lib/mis/factory-time';
import {
  isIdempotencyKey,
  isUuid,
  parkable,
  rejectable,
  type QueuedWriteEnvelope,
  type QueuedWriteKind,
} from '@/lib/mis/offline/idempotency';
import { getCurrentUser } from '@/server/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { requirePermission } from '@/server/mis/auth';
import { getCorrectionWindowDays, getFactoryTimezone } from '@/server/mis/business-rules';
import { runIdempotent, type IdempotentResult, type MisTx, type RunOptions } from '@/server/mis/idempotency';
import {
  authenticateDevice,
  parseHealthReport,
  recordDeviceSync,
} from '@/server/mis/kiosk-device';

/**
 * Punch ingestion — the server side of a badge scan (Phase 13, MIS-240).
 * Contract: Appendix B. Decisions: D15 (a punch carries the DEVICE's time, and a
 * clock outside tolerance parks, never clamps), D18 (a retired tablet's punches
 * still land, flagged), D20 (a day is derived from punches), D21 (immutable
 * punches; a closed day, an unknown badge and a leaver park), D22 (which day a
 * punch belongs to is decided on the FACTORY's clock).
 *
 * TWO DOORS, ONE FUNCTION. A tablet reaches `ingestDevicePunch` with a device
 * token; the portal's kiosk screen reaches `submitPunch` with a user session.
 * Both end in `applyPunch`, inside `runIdempotent`, so a punch lands exactly once
 * whichever door it used and however many times it was sent (Appendix B §B.7).
 *
 * WHAT THIS NEVER DOES: compute lateness or overtime (D20 — no rule exists yet),
 * touch `lateMinutes` / `otMinutes`, edit or delete a punch (the database refuses),
 * or overwrite a day a person edited by hand.
 */

export const PUNCH_KINDS = ['attendance.punch_in', 'attendance.punch_out'] as const satisfies readonly QueuedWriteKind[];
export type PunchKind = (typeof PUNCH_KINDS)[number];

export function isPunchKind(value: unknown): value is PunchKind {
  return typeof value === 'string' && (PUNCH_KINDS as readonly string[]).includes(value);
}

/** What a scan carries. Only these fields cross the boundary. */
export type PunchPayload = {
  /** The employee code the printed badge encodes (D19's `badgeCode`). */
  badgeCode: string;
  /** The gate operator who confirmed the face (K1, K9). Recorded as a claim; optional for now (D21). */
  operatorId?: string;
  /** The shift the tablet says this person is on — from its pull (D19). A hint, validated here. */
  shiftId?: string;
  /**
   * K2's Fix: this punch re-records an earlier one that parked as an unrecognised badge, for
   * the person it really was, at the ORIGINAL scan time. Names that parked write's key so it
   * can be marked resolved. Honoured only for the same device or the same user's own
   * `BADGE_UNKNOWN` park — it can close nothing else.
   */
  correctsKey?: string;
};

/** JSON-safe: this is what every duplicate of the punch is answered with (§B.3). */
export type PunchResult = {
  punchId: string;
  employeeId: string;
  employeeName: string;
  direction: 'IN' | 'OUT';
  /** The device's time, exactly as recorded — never clamped (D15). */
  punchedAt: string;
  /** The attendance day this punch belongs to, in the factory's zone (D22). */
  workDate: string | null;
  /** True when the attendance day's clock times were written. */
  dayRebuilt: boolean;
  /** Set when a person had edited that day by hand, so the punch was kept but the day was not touched. */
  dayHeld: 'EDITED_BY_HAND' | null;
};

type Source =
  | { kind: 'device'; deviceId: string; revoked: boolean }
  | { kind: 'user'; userId: string };

/** How far either side of a punch to look for its partners. Twice the longest stretch of work, plus slack. */
const NEIGHBOURHOOD_MS = 40 * 60 * 60 * 1000;

function parsePayload(payload: unknown): { badgeCode: string; operatorId?: string; shiftId?: string; correctsKey?: string } {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const badge = typeof p.badgeCode === 'string' ? p.badgeCode.trim().toUpperCase() : '';
  if (!badge || badge.length > 64) throw rejectable('MALFORMED', 'This punch has no badge code.');

  const operatorId = typeof p.operatorId === 'string' && p.operatorId.trim() ? p.operatorId.trim() : undefined;
  if (operatorId && !isUuid(operatorId)) throw rejectable('MALFORMED', 'This punch names an operator that is not valid.');

  const shiftId = typeof p.shiftId === 'string' && p.shiftId.trim() ? p.shiftId.trim() : undefined;
  if (shiftId && !isUuid(shiftId)) throw rejectable('MALFORMED', 'This punch names a shift that is not valid.');

  const correctsKey = typeof p.correctsKey === 'string' && p.correctsKey.trim() ? p.correctsKey.trim() : undefined;
  if (correctsKey && !isIdempotencyKey(correctsKey)) throw rejectable('MALFORMED', 'This punch names an earlier entry that is not valid.');

  return { badgeCode: badge, operatorId, shiftId, correctsKey };
}

/**
 * The business write for one punch, run inside the idempotency transaction.
 *
 * Everything that can refuse it does so BEFORE the punch row is inserted: a throw
 * rolls the whole transaction back, key claim included, and `runIdempotent` parks
 * it durably with its payload for a person.
 */
async function applyPunch(
  tx: MisTx,
  envelope: QueuedWriteEnvelope,
  source: Source,
): Promise<{ entityType: string; entityId: string; result: PunchResult }> {
  const direction = envelope.kind === 'attendance.punch_in' ? 'IN' : 'OUT';
  const payload = parsePayload(envelope.payload);

  const recordedAt = new Date(envelope.clientRecordedAt);
  if (Number.isNaN(recordedAt.getTime())) throw rejectable('MALFORMED', 'The recorded time is not a valid date.');

  const [timeZone, windowDays] = await Promise.all([getFactoryTimezone(), getCorrectionWindowDays()]);

  // Who was scanned? The employee code is unique; a soft-deleted or inactive
  // person is a different problem from an unknown one, so look without filtering.
  const employee = await tx.misEmployee.findFirst({
    where: { employeeCode: payload.badgeCode },
    select: { id: true, name: true, isActive: true, deletedAt: true },
  });
  const scanned = `${formatFactoryTime(recordedAt, timeZone)} · code ${payload.badgeCode}`;
  if (!employee) throw parkable('BADGE_UNKNOWN', `Badge not recognised. Scanned ${scanned}.`);
  if (!employee.isActive || employee.deletedAt) {
    throw parkable('EMPLOYEE_INACTIVE', `${employee.name} is no longer on the active roll. Scanned ${scanned}.`);
  }

  const shifts = await tx.misShift.findMany({
    where: { isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true },
  });
  // The tablet's shift is a hint, not a fact: use it only if it names a real active shift.
  const hintShiftId = payload.shiftId && shifts.some((s) => s.id === payload.shiftId) ? payload.shiftId : null;

  // The day is a function of ALL this person's active punches (D20). Superseded ones
  // are not active — `supersededBy: null` is "nothing has replaced me".
  const nearby = await tx.misAttendancePunch.findMany({
    where: {
      employeeId: employee.id,
      punchedAt: {
        gte: new Date(recordedAt.getTime() - NEIGHBOURHOOD_MS),
        lte: new Date(recordedAt.getTime() + NEIGHBOURHOOD_MS),
      },
      supersededBy: null,
    },
    select: { id: true, direction: true, punchedAt: true, shiftId: true },
  });
  const existing: PunchFact[] = nearby.map((r) => ({
    id: r.id,
    direction: r.direction,
    punchedAt: r.punchedAt,
    shiftId: r.shiftId,
  }));

  const punchId = randomUUID();
  const incoming: PunchFact = { id: punchId, direction, punchedAt: recordedAt, shiftId: hintShiftId };
  const before = deriveDays(existing, shifts, timeZone);
  const after = deriveDays([...existing, incoming], shifts, timeZone);

  // Which day is this punch for? Normally the day it landed in; a repeated clock-in
  // inside a stretch is absorbed by it, so fall back to where it would have gone.
  const workDate =
    [...after.values()].find((d) => d.punchIds.includes(punchId))?.workDate ??
    workDateFor(recordedAt, shifts, timeZone, hintShiftId).workDate;

  if (!isWithinCorrectionWindow(workDate, new Date(), windowDays, timeZone)) {
    throw parkable(
      'CORRECTION_WINDOW_CLOSED',
      `${workDate} is past the ${windowDays}-day correction window. A Super Attendance Operator must decide this punch (${employee.name}, ${direction === 'IN' ? 'in' : 'out'}, ${scanned}).`,
    );
  }

  await tx.misAttendancePunch.create({
    data: {
      id: punchId,
      idempotencyKey: envelope.key,
      employeeId: employee.id,
      direction,
      // The device's time, raw. A value outside tolerance never gets here (checkTiming
      // parked it) and is never replaced with now() (D15).
      punchedAt: recordedAt,
      deviceId: source.kind === 'device' ? source.deviceId : null,
      fromRevokedDevice: source.kind === 'device' ? source.revoked : false,
      operatorId: payload.operatorId ?? null,
      recordedById: source.kind === 'user' ? source.userId : null,
      shiftId: hintShiftId,
    },
  });

  // K2's Fix: the earlier scan that parked as an unrecognised badge is now accounted for.
  // Scoped to the SAME device (or the same user) and to that one reason, so this can close
  // nothing that belongs to anyone else and nothing that needs a person's judgement.
  if (payload.correctsKey) {
    await tx.misQueuedWrite.updateMany({
      where: {
        key: payload.correctsKey,
        status: 'PARKED',
        parkReason: 'BADGE_UNKNOWN',
        resolvedAt: null,
        ...(source.kind === 'device' ? { deviceId: source.deviceId } : { actorId: source.userId }),
      },
      data: {
        resolvedAt: new Date(),
        resolvedById: source.kind === 'user' ? source.userId : null,
        resolutionNote: `Re-recorded from the tablet as ${direction === 'IN' ? 'a clock-in' : 'a clock-out'} for ${employee.name} (punch ${punchId}).`,
      },
    });
  }

  // Bring the register in line with what the punches now say.
  const plan = planDayUpdates(before, after);
  let dayRebuilt = false;
  let dayHeld: PunchResult['dayHeld'] = null;

  for (const day of plan.upsert) {
    const date = dateKeyToDbDate(day.workDate);
    const row = await tx.misAttendance.findUnique({ where: { employeeId_date: { employeeId: employee.id, date } } });
    const isThisPunchsDay = day.workDate === workDate;

    if (row?.editedAt) {
      // A person decided this day. The punch is recorded; the day is theirs (D20).
      if (isThisPunchsDay) dayHeld = 'EDITED_BY_HAND';
      continue;
    }
    if (!row) {
      await tx.misAttendance.create({
        data: {
          employeeId: employee.id,
          date,
          shiftId: day.shiftId,
          status: 'PRESENT',
          clockIn: day.clockIn,
          clockOut: day.clockOut,
        },
      });
    } else {
      await tx.misAttendance.update({
        where: { id: row.id },
        data: {
          // A derived time wins; a null (only one side has arrived) never erases what is there.
          clockIn: day.clockIn ?? row.clockIn,
          clockOut: day.clockOut ?? row.clockOut,
          shiftId: day.shiftId ?? row.shiftId,
          // Turning up overrides "absent"; it never overrides leave, half-day or late.
          status: row.status === 'ABSENT' ? 'PRESENT' : row.status,
          // lateMinutes and otMinutes are deliberately absent (D20).
        },
      });
    }
    if (isThisPunchsDay) dayRebuilt = true;
  }

  // A day the earlier punches had filed and the new one pairs away — e.g. the lone
  // night clock-out that sat under the wrong date until its clock-in arrived.
  for (const workDateKey of plan.vacated) {
    const row = await tx.misAttendance.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date: dateKeyToDbDate(workDateKey) } },
    });
    const derived = before.get(workDateKey);
    if (!row || row.editedAt || !derived) continue;
    const isExactlyWhatPunchesMade =
      (row.clockIn?.getTime() ?? null) === (derived.clockIn?.getTime() ?? null) &&
      (row.clockOut?.getTime() ?? null) === (derived.clockOut?.getTime() ?? null);
    if (!isExactlyWhatPunchesMade) continue; // someone else wrote here; leave it

    const untouched =
      row.status === 'PRESENT' && row.lateMinutes === 0 && row.otMinutes === 0 && !row.approvedOut && !row.notes;
    if (untouched) await tx.misAttendance.delete({ where: { id: row.id } });
    else await tx.misAttendance.update({ where: { id: row.id }, data: { clockIn: null, clockOut: null } });
  }

  return {
    entityType: 'MisAttendancePunch',
    entityId: punchId,
    result: {
      punchId,
      employeeId: employee.id,
      employeeName: employee.name,
      direction,
      punchedAt: recordedAt.toISOString(),
      workDate,
      dayRebuilt,
      dayHeld,
    },
  };
}

async function auditApplied(out: IdempotentResult<PunchResult>, actorId: string | null, deviceId: string | null) {
  // After commit, never inside the transaction: an audit row for a write that rolled back
  // would be a record of something that did not happen.
  if (out.outcome !== 'APPLIED' || !out.result) return;
  await logAuditEvent({
    actorId,
    action: 'ATTENDANCE_PUNCH',
    entity: 'MisAttendancePunch',
    entityId: out.result.punchId,
    after: {
      employeeId: out.result.employeeId,
      direction: out.result.direction,
      punchedAt: out.result.punchedAt,
      workDate: out.result.workDate,
      deviceId,
    },
  });
}

/** Read an untrusted body into an envelope, or say precisely why it cannot be one. */
function toEnvelope(body: unknown): { envelope: QueuedWriteEnvelope } | { verdict: IdempotentResult<PunchResult> } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (!isIdempotencyKey(b.key)) {
    return { verdict: { outcome: 'REJECTED', reason: 'BAD_KEY', detail: 'The idempotency key is not a UUID.' } };
  }
  if (!isPunchKind(b.kind)) {
    return { verdict: { outcome: 'REJECTED', reason: 'MALFORMED', detail: 'This is not a punch.' } };
  }
  const at = typeof b.clientRecordedAt === 'string' ? new Date(b.clientRecordedAt) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return { verdict: { outcome: 'REJECTED', reason: 'MALFORMED', detail: 'The recorded time is not a valid date.' } };
  }
  return {
    envelope: { key: b.key, kind: b.kind, payload: b.payload, clientRecordedAt: at.toISOString() },
  };
}

/**
 * A tablet sends a punch. Authenticates by device token FIRST — before the body is
 * read into anything — and accepts a retired tablet's punches, flagged, because they
 * are real events that happened (D18). The tablet never chooses its own identity:
 * `deviceId` comes from the token, not the payload.
 *
 * Throws `KioskDeviceError` only for an unauthenticated caller; every verdict about
 * the punch itself is returned as a value (§B.10.3).
 */
export async function ingestDevicePunch(
  authorizationHeader: string | null | undefined,
  body: unknown,
): Promise<IdempotentResult<PunchResult>> {
  const device = await authenticateDevice(authorizationHeader, { allowRevoked: true });

  const parsed = toEnvelope(body);
  if ('verdict' in parsed) return parsed.verdict;
  const { envelope } = parsed;

  const out = await runIdempotent<PunchResult>(
    { ...envelope, deviceId: device.id },
    (tx) => applyPunch(tx, envelope, { kind: 'device', deviceId: device.id, revoked: device.revoked }),
  );

  // Contact worked, so the staleness card may turn green (D19) — unless the server
  // itself asked to retry, or the tablet is already retired.
  if (!device.revoked && out.outcome !== 'RETRY') {
    const health = (body as { health?: unknown } | null)?.health;
    await recordDeviceSync(device, parseHealthReport(health));
  }
  await auditApplied(out, null, device.id);
  return out;
}

/**
 * The portal's kiosk screen records a punch — live, or replayed from the offline
 * queue. The actor is the user who made it (`queuedBy`) and must be the person signed
 * in now, or it parks: a punch is never re-attributed to whoever happens to be
 * signed in when a sync runs (§B.10.2). `attendance.write` is checked inside the
 * transaction, so a right withdrawn between tap and sync parks as FORBIDDEN.
 */
export async function submitPunch(
  envelope: QueuedWriteEnvelope,
  options: RunOptions = {},
): Promise<IdempotentResult<PunchResult>> {
  const user = await getCurrentUser();
  if (!user) return { outcome: 'RETRY', detail: 'You are signed out. Sign in and this will send.' };

  const parsed = toEnvelope(envelope);
  if ('verdict' in parsed) return parsed.verdict;
  const clean = parsed.envelope;

  const out = await runIdempotent<PunchResult>(
    { ...clean, deviceId: envelope.deviceId, actorId: envelope.queuedBy ?? user.id },
    async (tx) => {
      if (envelope.queuedBy && envelope.queuedBy !== user.id) {
        throw parkable(
          'FORBIDDEN',
          'This punch was recorded by a different user than the one signed in now, so it will not be sent under their name. Ask them to sign in.',
        );
      }
      await requirePermission('attendance.write');
      return applyPunch(tx, clean, { kind: 'user', userId: user.id });
    },
    options,
  );

  await auditApplied(out, user.id, null);
  return out;
}
