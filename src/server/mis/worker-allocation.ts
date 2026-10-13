import type { MisWorkerAllocation } from '@/generated/prisma/client';
import {
  bookingIntersectsShift,
  instantAtAxisMinute,
  isDateKey,
  personMinutes,
  shiftDateKeyFor,
  shiftWindowInstants,
} from '@/lib/mis/crew-hours';
import { addDaysToDateKey, dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { presenceOf, type Presence } from '@/lib/mis/presence';
import { db } from '@/server/db';
import { requirePermission, type MisActor } from '@/server/mis/auth';
import { releaseWorkerRows } from '@/server/mis/allocation-release';
import { logAuditEvent, type AuditEntry } from '@/server/mis/audit';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { isActiveStatus } from '@/server/mis/job-phases';
import { lockStockKeys } from '@/server/mis/stock-lock';
import { resolveVisibleEmployeeWhere } from '@/server/mis/visibility';

/**
 * Worker allocation — MIS-260/262. Mirrors `machines-board.ts`'s allocation
 * pattern for people rather than inventing a second one.
 *
 * Pool visibility applies to the *candidates* here (D4/D5 — people narrow by
 * pool, machines do not). `machineAllocationId` itself is never filtered by
 * pool; only the employee list a supervisor may staff it with is.
 *
 * R3 WRK: every date here is a factory DATE KEY (`YYYY-MM-DD`), never a `Date` or an ISO string
 * (B88); the row's `allocationDate` is `allocationDateFor(key)`, the same UTC-midnight value the
 * attendance table stores for that day.
 */

const WORKABLE_ROLES = ['WORKER', 'QC'] as const;

/** Mirrors PRESENT_STATUSES in attendance.ts — small enough that importing it is not worth the coupling. */
const PRESENT_STATUSES = ['PRESENT', 'HALF_DAY', 'LATE'];

/** Roles that may override a blocked conflict, with a reason (R3 B98). */
const OVERRIDE_ROLES = ['ADMIN', 'OWNER'];

/** The day a worker row belongs to, as stored: UTC midnight of the factory date key (B88). */
export function allocationDateFor(dateKey: string): Date {
  return dateKeyToDbDate(dateKey);
}

const workerLockKey = (employeeId: string, dateKey: string, shiftId: string | null) =>
  `worker-${employeeId}-${dateKey}-${shiftId ?? 'none'}`;

const allocationInclude = {
  machineAllocation: {
    include: {
      machine: { select: { id: true, name: true } },
      order: { select: { orderNumber: true } },
    },
  },
  jobPhase: { include: { process: { select: { name: true } } } },
} as const;

export type WorkerConflictKind = 'OVERLAP' | 'ON_LEAVE' | 'NOT_IN';

export type WorkerConflict = {
  employeeId: string;
  employeeName: string;
  kind: WorkerConflictKind;
  conflictingAllocationId: string | null;
  conflictingMachineName: string | null;
  conflictingProcessName: string | null;
  conflictingOrderNumber: string | null;
};

/** Kept as the name the screens already use. */
export type WorkerOverlapWarning = WorkerConflict;

export type AssignWorkersInput = {
  machineAllocationId: string;
  employeeIds: string[];
  shiftId: string;
  /** A factory date key, `YYYY-MM-DD` (R3 B88). Omitted means the factory's today. */
  allocationDate?: string;
  jobPhaseId?: string;
  /** Create people who only carry a warning (NOT_IN today). */
  confirmWarnings?: boolean;
  /** ADMIN/OWNER only: create people who are BLOCKED (overlap, on leave), with a reason of 3+ characters. */
  override?: { reason: string };
  notes?: string;
};

export type AssignWorkersResult = {
  created: MisWorkerAllocation[];
  alreadyAssigned: string[];
  /** Not created: OVERLAP / ON_LEAVE for a role that cannot override. */
  blocked: WorkerConflict[];
  /** Not created yet: NOT_IN today, until `confirmWarnings`. */
  warnings: WorkerConflict[];
};

async function eligibleEmployees(actor: MisActor, ids: string[]): Promise<Map<string, string>> {
  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const rows = await db.misEmployee.findMany({
    where: { AND: [poolWhere, { id: { in: ids } }], role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  return new Map((rows ?? []).map((e) => [e.id, e.name]));
}

type ShiftRow = { id: string; name: string; startTime: string; endTime: string };

async function loadActiveShift(client: Pick<typeof db, 'misShift'>, shiftId: string): Promise<ShiftRow> {
  const shift = await client.misShift.findFirst({
    where: { id: shiftId, isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true },
  });
  if (!shift) throw new Error('That shift is not active.');
  return shift;
}

/** today <= date <= today+7; a night shift still running after midnight may be yesterday's (R3 B92). */
function assertDateInRange(dateKey: string, shift: ShiftRow, now: Date, tz: string): void {
  if (!isDateKey(dateKey)) throw new Error('That date is not valid.');
  const today = factoryDateKey(now, tz);
  const earliest = shiftDateKeyFor(shift, now, tz) < today ? shiftDateKeyFor(shift, now, tz) : today;
  if (dateKey < earliest || dateKey > addDaysToDateKey(today, 7)) {
    throw new Error('Pick a date from today to 7 days ahead.');
  }
}

/** Is `dateKey`'s shift happening now, so attendance and "ended" bookings are about right now? */
function isLiveShift(dateKey: string, shift: ShiftRow, now: Date, tz: string): boolean {
  if (dateKey === factoryDateKey(now, tz)) return true;
  const w = shiftWindowInstants(dateKey, shift, tz);
  return now.getTime() >= w.start.getTime() && now.getTime() < w.end.getTime();
}

/** Bookings that ended before this are not "where the person is" (R3 B86). */
function endedCutoff(dateKey: string, shift: ShiftRow, now: Date, tz: string): Date {
  return isLiveShift(dateKey, shift, now, tz) ? now : shiftWindowInstants(dateKey, shift, tz).start;
}

/**
 * Assign a crew to a machine allocation, one action for however many people
 * (MIS-263: "a crew of four is assigned in one action").
 *
 * R3 B98: the old "only warns" rule is now an application lock with ADMIN override. A person on
 * another booking (OVERLAP) or on approved leave (ON_LEAVE) is BLOCKED for a supervisor; the
 * response lists them and nothing is created for them. ADMIN/OWNER may create them with
 * `override: { reason }`, which is written to the row's notes and to the audit trail. A person who
 * is simply not clocked in today (NOT_IN) is a warning, created with `confirmWarnings`.
 *
 * An employee already on *this same* machine allocation for this date/shift
 * is silently a no-op, not a conflict — re-submitting a crew that includes
 * someone already staffed is the normal shape of "add two more people".
 */
export async function assignWorkers(input: AssignWorkersInput): Promise<AssignWorkersResult> {
  const actor = await requirePermission('production.write');
  return assignCore(actor, input, new Date());
}

async function assignCore(actor: MisActor, input: AssignWorkersInput, now: Date): Promise<AssignWorkersResult> {
  const machineAllocation = await db.misMachineAllocation.findUnique({
    where: { id: input.machineAllocationId },
  });
  if (!machineAllocation) throw new Error('That machine allocation no longer exists.');
  if (machineAllocation.releasedAt) throw new Error('That machine allocation has already ended.');

  const employeeIds = [...new Set(input.employeeIds ?? [])];
  if (employeeIds.length === 0) throw new Error('Pick at least one person.');

  // The booking's own phase is the default; a different one is refused (R3 B92).
  if (input.jobPhaseId && machineAllocation.jobPhaseId && input.jobPhaseId !== machineAllocation.jobPhaseId) {
    throw new Error('That phase is not the one booked on this machine.');
  }
  const jobPhaseId = input.jobPhaseId ?? machineAllocation.jobPhaseId ?? null;

  // Phase 9 (MIS-265): the phase must belong to the same order as the
  // machine allocation being staffed — a cross-linked phase would corrupt
  // both the order board and the utilisation report.
  if (jobPhaseId) {
    const phase = await db.misJobPhase.findFirst({
      where: { id: jobPhaseId, deletedAt: null },
      include: { process: { select: { name: true } } },
    });
    if (!phase) throw new Error('That phase no longer exists.');
    if (machineAllocation.orderId && machineAllocation.orderId !== phase.orderId) {
      throw new Error(`${phase.process.name} belongs to a different order than this machine allocation.`);
    }
    if (!isActiveStatus(phase.status)) {
      throw new Error(
        `${phase.process.name} is not open for assignment (it is ${phase.status.toLowerCase().replace('_', ' ')}).`,
      );
    }
  }

  const tz = await getFactoryTimezone();
  const shift = await loadActiveShift(db, input.shiftId);
  const dateKey = input.allocationDate ?? factoryDateKey(now, tz);
  assertDateInRange(dateKey, shift, now, tz);
  if (!bookingIntersectsShift(machineAllocation, dateKey, shift, tz)) {
    throw new Error('That booking does not run during this shift on this date.');
  }

  const names = await eligibleEmployees(actor, employeeIds);
  const missing = employeeIds.filter((id) => !names.has(id));
  if (missing.length > 0) throw new Error(`Not found or not in your team: ${missing.join(', ')}`);

  const allocationDate = allocationDateFor(dateKey);
  const live = isLiveShift(dateKey, shift, now, tz);
  const cutoff = endedCutoff(dateKey, shift, now, tz);
  const overrideReason = input.override?.reason?.trim() ?? '';
  const mayOverride = OVERRIDE_ROLES.includes(actor.role) && overrideReason.length >= 3;

  const pendingAudit: AuditEntry[] = [];
  const outcome = await db.$transaction(async (tx) => {
    // One lock per person/day/shift, sorted by lockStockKeys, so two supervisors staffing the same
    // person cannot both pass the duplicate check (R3 B91).
    await lockStockKeys(tx, employeeIds.map((id) => workerLockKey(id, dateKey, input.shiftId)));

    const attendance = await tx.misAttendance.findMany({
      where: { employeeId: { in: employeeIds }, date: allocationDate },
      select: { employeeId: true, clockIn: true, clockOut: true, status: true },
    });
    const leaves = await tx.misLeaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, date: allocationDate, status: 'APPROVED' },
      select: { employeeId: true },
    });
    const attendanceBy = new Map((attendance ?? []).map((a) => [a.employeeId, a]));
    const onLeave = new Set((leaves ?? []).map((l) => l.employeeId));

    const created: MisWorkerAllocation[] = [];
    const alreadyAssigned: string[] = [];
    const blocked: WorkerConflict[] = [];
    const warnings: WorkerConflict[] = [];

    for (const employeeId of employeeIds) {
      const employeeName = names.get(employeeId) ?? 'This worker';
      const rowFilter = { employeeId, allocationDate, shiftId: input.shiftId, releasedAt: null, deletedAt: null };

      const same = await tx.misWorkerAllocation.findFirst({
        where: { ...rowFilter, machineAllocationId: input.machineAllocationId },
        select: { id: true, machineAllocationId: true },
      });
      if (same && same.machineAllocationId === input.machineAllocationId) {
        alreadyAssigned.push(employeeId);
        continue;
      }

      const other = await tx.misWorkerAllocation.findFirst({
        where: {
          ...rowFilter,
          machineAllocationId: { not: input.machineAllocationId },
          machineAllocation: { releasedAt: null, endsAt: { gte: cutoff } },
        },
        include: allocationInclude,
      });

      const conflicts: WorkerConflict[] = [];
      const base = { employeeId, employeeName };
      if (other && other.machineAllocationId !== input.machineAllocationId) {
        conflicts.push({
          ...base,
          kind: 'OVERLAP',
          conflictingAllocationId: other.id,
          conflictingMachineName: other.machineAllocation.machine.name,
          conflictingProcessName: other.jobPhase?.process.name ?? null,
          conflictingOrderNumber: other.machineAllocation.order?.orderNumber ?? null,
        });
      }
      if (onLeave.has(employeeId)) {
        conflicts.push({ ...base, kind: 'ON_LEAVE', conflictingAllocationId: null, conflictingMachineName: null, conflictingProcessName: null, conflictingOrderNumber: null });
      } else if (live) {
        const presence = presenceOf({ attendance: attendanceBy.get(employeeId) ?? null, onApprovedLeave: false });
        if (presence !== 'IN') {
          conflicts.push({ ...base, kind: 'NOT_IN', conflictingAllocationId: null, conflictingMachineName: null, conflictingProcessName: null, conflictingOrderNumber: null });
        }
      }

      let notes = input.notes ?? null;
      let overridden = false;
      if (conflicts.length > 0) {
        const hard = conflicts.filter((c) => c.kind !== 'NOT_IN');
        if (mayOverride) {
          overridden = true;
          notes = `${notes ? `${notes} ` : ''}[override] ${overrideReason}`;
        } else if (hard.length > 0) {
          blocked.push(...hard);
          continue;
        } else if (!input.confirmWarnings) {
          warnings.push(...conflicts);
          continue;
        }
      }

      const rec = await tx.misWorkerAllocation.create({
        data: {
          machineAllocationId: input.machineAllocationId,
          employeeId,
          jobPhaseId,
          shiftId: input.shiftId,
          allocationDate,
          assignedById: actor.userId,
          notes,
        },
      });
      created.push(rec);

      pendingAudit.push({
        actorId: actor.userId,
        action: 'ASSIGN_WORKER',
        entity: 'MisWorkerAllocation',
        entityId: rec.id,
        after: {
          employeeId,
          machineAllocationId: input.machineAllocationId,
          shiftId: input.shiftId,
          dateKey,
          confirmedWarnings: conflicts.length > 0 && !overridden,
        },
      });
      if (overridden) {
        pendingAudit.push({
          actorId: actor.userId,
          action: 'ASSIGN_WORKER_OVERRIDE',
          entity: 'MisWorkerAllocation',
          entityId: rec.id,
          after: { employeeId, conflicts: conflicts.map((c) => c.kind), reason: overrideReason },
        });
      }
    }

    return { created, alreadyAssigned, blocked, warnings };
  });
  // Audit after the commit: a crashed or rolled-back assign leaves no audit row for a row that never existed.
  for (const entry of pendingAudit) await logAuditEvent(entry);
  return outcome;
}

/**
 * Release one person from a booking. Open rows only; the caller must be able to see the person
 * (their pool); the release goes through the shared helper so the audit carries the reason.
 */
export async function releaseWorker(workerAllocationId: string) {
  const actor = await requirePermission('production.write');
  return db.$transaction(async (tx) => {
    const row = await tx.misWorkerAllocation.findFirst({
      where: { id: workerAllocationId, deletedAt: null },
    });
    if (!row) throw new Error('That assignment no longer exists.');
    if (row.releasedAt) throw new Error('Already released.');

    const poolWhere = await resolveVisibleEmployeeWhere(actor);
    const visible = await tx.misEmployee.findMany({
      where: { AND: [poolWhere, { id: row.employeeId }] },
      select: { id: true },
      take: 1,
    });
    if (!visible || visible.length === 0) throw new Error(`Not found or not in your team: ${row.employeeId}`);

    const at = new Date();
    await releaseWorkerRows(tx, { ids: [row.id] }, { reason: 'MANUAL', actorUserId: actor.userId, at });
    return { ...row, releasedAt: at };
  });
}

/**
 * Move a person from one booking to another in one transaction: the old row is released with
 * reason MOVED and a new open row (same person, date, shift; phase from the target) is created.
 */
export async function moveWorker(input: { workerAllocationId: string; toMachineAllocationId: string }) {
  const actor = await requirePermission('production.write');
  const now = new Date();
  const tz = await getFactoryTimezone();

  const pendingAudit: AuditEntry[] = [];
  const created = await db.$transaction(async (tx) => {
    const row = await tx.misWorkerAllocation.findFirst({ where: { id: input.workerAllocationId, deletedAt: null } });
    if (!row) throw new Error('That assignment no longer exists.');
    if (row.releasedAt) throw new Error('Already released.');
    if (row.machineAllocationId === input.toMachineAllocationId) throw new Error('That person is already on this booking.');

    const poolWhere = await resolveVisibleEmployeeWhere(actor);
    const visible = await tx.misEmployee.findMany({
      where: { AND: [poolWhere, { id: row.employeeId }] },
      select: { id: true },
      take: 1,
    });
    if (!visible || visible.length === 0) throw new Error(`Not found or not in your team: ${row.employeeId}`);

    const target = await tx.misMachineAllocation.findUnique({ where: { id: input.toMachineAllocationId } });
    if (!target) throw new Error('That machine allocation no longer exists.');
    if (target.releasedAt) throw new Error('That machine allocation has already ended.');
    if (target.endsAt.getTime() <= now.getTime()) throw new Error('That machine allocation has already ended.');

    const dateKey = row.allocationDate.toISOString().slice(0, 10);
    if (row.shiftId) {
      const shift = await loadActiveShift(tx as unknown as typeof db, row.shiftId);
      if (!bookingIntersectsShift(target, dateKey, shift, tz)) {
        throw new Error('That booking does not run during this shift on this date.');
      }
    }

    await lockStockKeys(tx, [workerLockKey(row.employeeId, dateKey, row.shiftId)]);
    await releaseWorkerRows(tx, { ids: [row.id] }, { reason: 'MOVED', actorUserId: actor.userId, at: now });

    const moved = await tx.misWorkerAllocation.create({
      data: {
        machineAllocationId: target.id,
        employeeId: row.employeeId,
        jobPhaseId: target.jobPhaseId ?? null,
        shiftId: row.shiftId,
        allocationDate: row.allocationDate,
        assignedById: actor.userId,
      },
    });
    pendingAudit.push({
      actorId: actor.userId,
      action: 'ASSIGN_WORKER',
      entity: 'MisWorkerAllocation',
      entityId: moved.id,
      after: {
        employeeId: row.employeeId,
        machineAllocationId: target.id,
        shiftId: row.shiftId,
        dateKey,
        movedFrom: row.id,
      },
    });
    return moved;
  });
  for (const entry of pendingAudit) await logAuditEvent(entry);
  return created;
}

export type CopyCrewSkip = { employeeId: string; name: string; reason: string };

/**
 * Copy one shift's crew to another day (R3 B93): for each booking active on the target date and
 * shift that had rows on the source date and shift FOR THE SAME BOOKING ID, assign the same people
 * through the same validation and lock rules. People who are blocked are skipped and listed.
 */
export async function copyCrew(input: {
  fromDateKey: string;
  toDateKey: string;
  shiftId: string;
}): Promise<{ copied: number; bookings: number; skipped: CopyCrewSkip[] }> {
  const actor = await requirePermission('production.write');
  if (!isDateKey(input.fromDateKey) || !isDateKey(input.toDateKey)) throw new Error('That date is not valid.');
  const now = new Date();

  const sourceRows = await db.misWorkerAllocation.findMany({
    where: { allocationDate: allocationDateFor(input.fromDateKey), shiftId: input.shiftId, deletedAt: null },
    select: { machineAllocationId: true, employeeId: true },
  });
  const bySource = new Map<string, Set<string>>();
  for (const r of sourceRows ?? []) {
    const set = bySource.get(r.machineAllocationId) ?? new Set<string>();
    set.add(r.employeeId);
    bySource.set(r.machineAllocationId, set);
  }

  const bookings = await bookingsForShift(input.toDateKey, input.shiftId);
  const skipped: CopyCrewSkip[] = [];
  let copied = 0;
  let touched = 0;

  const everyone = [...new Set([...bySource.values()].flatMap((s) => [...s]))];
  const eligible = everyone.length > 0 ? await eligibleEmployees(actor, everyone) : new Map<string, string>();

  for (const booking of bookings) {
    const wanted = bySource.get(booking.machineAllocationId);
    if (!wanted) continue;
    const ids = [...wanted].filter((id) => eligible.has(id));
    for (const id of wanted) if (!eligible.has(id)) skipped.push({ employeeId: id, name: id, reason: 'Not available' });
    if (ids.length === 0) continue;
    touched += 1;
    const res = await assignCore(
      actor,
      { machineAllocationId: booking.machineAllocationId, employeeIds: ids, shiftId: input.shiftId, allocationDate: input.toDateKey },
      now,
    );
    copied += res.created.length;
    for (const c of [...res.blocked, ...res.warnings]) {
      skipped.push({ employeeId: c.employeeId, name: c.employeeName, reason: c.kind });
    }
  }
  return { copied, bookings: touched, skipped };
}

export type WorkerAllocationEntry = {
  id: string;
  machineAllocationId: string;
  machineId: string;
  machineName: string;
  orderNumber: string | null;
  processName: string | null;
};

export type WorkerAvailabilityRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  /** True only while the person is clocked in and not clocked out (R3 B89). */
  clockedIn: boolean;
  presence: Presence;
  /** Every open row of the person for this date and shift: a person can be on several machines (R3 B87). */
  allocations: WorkerAllocationEntry[];
};

/**
 * Free, or assigned with the job and machine — for the whole pool, in a handful of queries
 * regardless of headcount (S8: "seventy employees is seventy queries if done naively").
 * Availability is *derived* here every time, never read from a stored column (D4).
 *
 * Rows whose booking was released, or ended before the cutoff, do not count (R3 B86).
 * Pool-scoped (D4/D5): only WORKER/QC employees within the caller's visibility subtree.
 */
export async function getWorkerAvailability(shiftId: string, dateKey: string): Promise<WorkerAvailabilityRow[]> {
  const actor = await requirePermission('production.read');
  if (!isDateKey(dateKey)) throw new Error('That date is not valid.');
  const allocationDate = allocationDateFor(dateKey);
  const now = new Date();
  const tz = await getFactoryTimezone();

  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const employees = await db.misEmployee.findMany({
    where: { ...poolWhere, role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true, name: true, employeeCode: true },
    orderBy: { name: 'asc' },
  });
  if (employees.length === 0) return [];

  const employeeIds = employees.map((e) => e.id);

  let cutoff = now;
  if (dateKey !== factoryDateKey(now, tz)) {
    const shift = await db.misShift.findFirst({ where: { id: shiftId }, select: { id: true, name: true, startTime: true, endTime: true } });
    cutoff = shift ? endedCutoff(dateKey, shift, now, tz) : instantAtAxisMinute(dateKey, 0, tz);
  }

  const [allocations, attendanceRows, leaves] = await Promise.all([
    db.misWorkerAllocation.findMany({
      where: {
        employeeId: { in: employeeIds },
        allocationDate,
        shiftId,
        releasedAt: null,
        deletedAt: null,
        machineAllocation: { releasedAt: null, endsAt: { gte: cutoff } },
      },
      include: allocationInclude,
    }),
    db.misAttendance.findMany({
      where: { employeeId: { in: employeeIds }, date: allocationDate },
      select: { employeeId: true, clockIn: true, clockOut: true, status: true },
    }),
    db.misLeaveRequest.findMany({
      where: { employeeId: { in: employeeIds }, date: allocationDate, status: 'APPROVED' },
      select: { employeeId: true },
    }),
  ]);

  const byEmployee = new Map<string, WorkerAllocationEntry[]>();
  for (const a of allocations ?? []) {
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push({
      id: a.id,
      machineAllocationId: a.machineAllocationId,
      machineId: a.machineAllocation.machine.id,
      machineName: a.machineAllocation.machine.name,
      orderNumber: a.machineAllocation.order?.orderNumber ?? null,
      processName: a.jobPhase?.process.name ?? null,
    });
    byEmployee.set(a.employeeId, list);
  }
  const attendanceBy = new Map((attendanceRows ?? []).map((r) => [r.employeeId, r]));
  const onLeave = new Set((leaves ?? []).map((l) => l.employeeId));

  return employees.map((e) => {
    const presence = presenceOf({ attendance: attendanceBy.get(e.id) ?? null, onApprovedLeave: onLeave.has(e.id) });
    return {
      employeeId: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
      clockedIn: presence === 'IN',
      presence,
      allocations: byEmployee.get(e.id) ?? [],
    };
  });
}

/**
 * The active shifts for the crew pickers. Gated on `production.read` (not `attendance.read` as
 * `listShifts` is): a QC inspector or an Admin opening the crew board needs the same list.
 */
export async function listActiveShifts(): Promise<{ id: string; name: string; startTime: string; endTime: string; isDefault: boolean }[]> {
  await requirePermission('production.read');
  const rows = await db.misShift.findMany({
    where: { isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true, isDefault: true },
    orderBy: { startTime: 'asc' },
  });
  return rows ?? [];
}

export type CrewBooking = {
  machineAllocationId: string;
  machineId: string;
  machineName: string;
  orderNumber: string | null;
  jobRef: string | null;
  processName: string | null;
  startsAt: Date;
  endsAt: Date;
};

async function bookingsForShift(dateKey: string, shiftId: string): Promise<CrewBooking[]> {
  const tz = await getFactoryTimezone();
  const shift = await loadActiveShift(db, shiftId);
  const w = shiftWindowInstants(dateKey, shift, tz);
  const rows = await db.misMachineAllocation.findMany({
    where: { releasedAt: null, startsAt: { lt: w.end }, endsAt: { gt: w.start } },
    include: {
      machine: { select: { id: true, name: true } },
      order: { select: { orderNumber: true } },
      jobPhase: { select: { id: true, process: { select: { name: true } } } },
    },
    orderBy: { startsAt: 'asc' },
  });
  return (rows ?? []).map((r) => ({
    machineAllocationId: r.id,
    machineId: r.machine.id,
    machineName: r.machine.name,
    orderNumber: r.order?.orderNumber ?? null,
    jobRef: r.jobRef ?? null,
    processName: r.jobPhase?.process.name ?? null,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
  }));
}

/**
 * The bookings a crew can be put on for one date and shift (R3 B93): live bookings overlapping the
 * shift window. A 18:00-02:00 booking shows under the 22:00 shift, on the date that shift started.
 */
export async function listCrewBookings(dateKey: string, shiftId: string): Promise<CrewBooking[]> {
  await requirePermission('production.read');
  if (!isDateKey(dateKey)) throw new Error('That date is not valid.');
  return bookingsForShift(dateKey, shiftId);
}

export type CrewSummary = {
  present: number;
  headcount: number;
  absent: number;
  onLeave: number;
  recorded: boolean;
  /** People of the pool with an open row on a live booking (R3 B100). */
  onMachines: number;
  /** Clocked in (IN) and not on any machine. */
  free: number;
  /** Live bookings today with nobody on them. */
  unstaffedBookings: number;
};

const EMPTY_SUMMARY: CrewSummary = {
  present: 0,
  headcount: 0,
  absent: 0,
  onLeave: 0,
  recorded: false,
  onMachines: 0,
  free: 0,
  unstaffedBookings: 0,
};

/**
 * "My crew today 14/17" (`R2-Supervisor.png`) — pool-scoped, unlike
 * `getDayAttendanceSummary()` in `attendance.ts`, which is deliberately
 * factory-wide for the attendance operator's home. Same present/absent/on-leave arithmetic, scoped
 * to WORKER/QC employees in the caller's D4 subtree, plus the staffing line (R3 B100).
 *
 * `date` may be a date key or a `Date` (converted with the factory zone); the default is the
 * factory's today, so at 00:30 IST it reads the new day.
 */
export async function getCrewSummary(date?: Date | string): Promise<CrewSummary> {
  const actor = await requirePermission('attendance.read');
  const now = new Date();
  const tz = await getFactoryTimezone();
  const key = typeof date === 'string' && isDateKey(date) ? date : factoryDateKey(date instanceof Date ? date : now, tz);
  const d = allocationDateFor(key);

  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const pool = await db.misEmployee.findMany({
    where: { ...poolWhere, role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const headcount = pool.length;
  if (headcount === 0) return { ...EMPTY_SUMMARY };
  const poolIds = pool.map((p) => p.id);

  const cutoff = key === factoryDateKey(now, tz) ? now : instantAtAxisMinute(key, 0, tz);
  const dayEnd = instantAtAxisMinute(addDaysToDateKey(key, 1), 0, tz);

  const [records, leaves, openRows, bookings] = await Promise.all([
    db.misAttendance.findMany({
      where: { employeeId: { in: poolIds }, date: d },
      select: { employeeId: true, status: true, clockIn: true, clockOut: true },
    }),
    db.misLeaveRequest.findMany({
      where: { employeeId: { in: poolIds }, date: d, status: 'APPROVED' },
      select: { employeeId: true },
    }),
    db.misWorkerAllocation.findMany({
      where: {
        employeeId: { in: poolIds },
        allocationDate: d,
        releasedAt: null,
        deletedAt: null,
        machineAllocation: { releasedAt: null, endsAt: { gte: cutoff } },
      },
      select: { employeeId: true },
    }),
    db.misMachineAllocation.findMany({
      where: { releasedAt: null, startsAt: { lt: dayEnd }, endsAt: { gte: cutoff } },
      select: {
        id: true,
        _count: { select: { workerAllocations: { where: { releasedAt: null, deletedAt: null, allocationDate: d } } } },
      },
    }),
  ]);

  const onLeaveIds = new Set((leaves ?? []).map((l) => l.employeeId));
  for (const r of records ?? []) if (r.status === 'LEAVE') onLeaveIds.add(r.employeeId);

  const present = (records ?? []).filter(
    (r) => !onLeaveIds.has(r.employeeId) && (r.clockIn !== null || PRESENT_STATUSES.includes(r.status)),
  ).length;

  const staffed = new Set((openRows ?? []).map((r) => r.employeeId));
  const recordBy = new Map((records ?? []).map((r) => [r.employeeId, r]));
  let free = 0;
  for (const id of poolIds) {
    const presence = presenceOf({ attendance: recordBy.get(id) ?? null, onApprovedLeave: onLeaveIds.has(id) });
    if (presence === 'IN' && !staffed.has(id)) free += 1;
  }

  return {
    headcount,
    present,
    onLeave: onLeaveIds.size,
    absent: Math.max(0, headcount - present - onLeaveIds.size),
    recorded: (records ?? []).length > 0,
    onMachines: staffed.size,
    free,
    unstaffedBookings: (bookings ?? []).filter((b) => b._count.workerAllocations === 0).length,
  };
}

export type OrderCrewGroup = {
  jobPhaseId: string | null;
  phaseName: string | null;
  machineName: string;
  dateKey: string;
  shiftName: string | null;
  people: { name: string; employeeCode: string; released: boolean }[];
};

/**
 * Who worked an order, grouped by phase, machine, day and shift (R3 B103). Names and codes only:
 * no rate, no wage. R3-PRD prints it on the job card.
 */
export async function getCrewForOrder(orderId: string): Promise<OrderCrewGroup[]> {
  await requirePermission('production.read');
  const rows = await db.misWorkerAllocation.findMany({
    where: { deletedAt: null, machineAllocation: { orderId } },
    include: {
      employee: { select: { name: true, employeeCode: true } },
      machineAllocation: {
        select: { machine: { select: { name: true } }, jobPhase: { select: { process: { select: { name: true } } } } },
      },
      jobPhase: { select: { process: { select: { name: true } } } },
      shift: { select: { name: true } },
    },
    orderBy: [{ allocationDate: 'asc' }, { createdAt: 'asc' }],
  });

  const groups = new Map<string, OrderCrewGroup>();
  for (const r of rows ?? []) {
    const dateKey = r.allocationDate.toISOString().slice(0, 10);
    const machineName = r.machineAllocation.machine.name;
    const key = [r.jobPhaseId ?? '-', machineName, dateKey, r.shift?.name ?? '-'].join('|');
    const group = groups.get(key) ?? {
      jobPhaseId: r.jobPhaseId ?? null,
      phaseName: r.jobPhase?.process.name ?? r.machineAllocation.jobPhase?.process.name ?? null,
      machineName,
      dateKey,
      shiftName: r.shift?.name ?? null,
      people: [],
    };
    group.people.push({ name: r.employee.name, employeeCode: r.employee.employeeCode, released: r.releasedAt !== null });
    groups.set(key, group);
  }
  return [...groups.values()];
}

export type ManpowerReport = {
  dateKey: string;
  shifts: { shiftId: string; name: string; allocated: number; clockedIn: number; idle: number; unstaffedBookings: number }[];
  phases: { orderNumber: string | null; phaseName: string | null; personHours: number }[];
};

/**
 * The day's manpower report (R3 B102). Per shift: allocated, clocked in (IN), idle (IN with no
 * row) and unstaffed bookings. Per order/phase: person-hours from `personMinutes`. Pool-scoped.
 * Names and hours only; there is no money anywhere in it.
 */
export async function getManpowerReport(dateKey: string): Promise<ManpowerReport> {
  const actor = await requirePermission('production.read');
  if (!isDateKey(dateKey)) throw new Error('That date is not valid.');
  const now = new Date();
  const tz = await getFactoryTimezone();
  const d = allocationDateFor(dateKey);

  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const pool = await db.misEmployee.findMany({
    where: { ...poolWhere, role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const poolIds = (pool ?? []).map((p) => p.id);
  const shifts = await db.misShift.findMany({
    where: { isActive: true },
    select: { id: true, name: true, startTime: true, endTime: true },
    orderBy: { startTime: 'asc' },
  });
  if (shifts.length === 0) return { dateKey, shifts: [], phases: [] };
  const windows = new Map(shifts.map((s) => [s.id, shiftWindowInstants(dateKey, s, tz)]));
  const spanStart = new Date(Math.min(...[...windows.values()].map((w) => w.start.getTime())));
  const spanEnd = new Date(Math.max(...[...windows.values()].map((w) => w.end.getTime())));

  const [rows, attendance, leaves, bookings] = await Promise.all([
    poolIds.length === 0
      ? Promise.resolve([])
      : db.misWorkerAllocation.findMany({
          where: { allocationDate: d, deletedAt: null, employeeId: { in: poolIds } },
          include: {
            machineAllocation: {
              select: {
                id: true,
                endsAt: true,
                order: { select: { orderNumber: true } },
                jobPhase: { select: { process: { select: { name: true } } } },
              },
            },
            jobPhase: { select: { process: { select: { name: true } } } },
          },
        }),
    poolIds.length === 0
      ? Promise.resolve([])
      : db.misAttendance.findMany({
          where: { employeeId: { in: poolIds }, date: d },
          select: { employeeId: true, shiftId: true, clockIn: true, clockOut: true, status: true },
        }),
    poolIds.length === 0
      ? Promise.resolve([])
      : db.misLeaveRequest.findMany({
          where: { employeeId: { in: poolIds }, date: d, status: 'APPROVED' },
          select: { employeeId: true },
        }),
    db.misMachineAllocation.findMany({
      where: { releasedAt: null, startsAt: { lt: spanEnd }, endsAt: { gt: spanStart } },
      select: { id: true, startsAt: true, endsAt: true },
    }),
  ]);

  const attendanceBy = new Map((attendance ?? []).map((a) => [a.employeeId, a]));
  const onLeave = new Set((leaves ?? []).map((l) => l.employeeId));

  const shiftOfAttendance = (a: { shiftId: string | null; clockIn: Date | null }): string | null => {
    if (a.shiftId) return a.shiftId;
    if (!a.clockIn) return null;
    for (const [id, w] of windows) if (a.clockIn.getTime() >= w.start.getTime() && a.clockIn.getTime() < w.end.getTime()) return id;
    return null;
  };

  const shiftRows = shifts.map((s) => {
    const mine = (rows ?? []).filter((r) => r.shiftId === s.id);
    const staffedEmployees = new Set(mine.map((r) => r.employeeId));
    const staffedBookings = new Set(mine.map((r) => r.machineAllocationId));
    let clockedIn = 0;
    let idle = 0;
    for (const id of poolIds) {
      const att = attendanceBy.get(id) ?? null;
      const presence = presenceOf({ attendance: att, onApprovedLeave: onLeave.has(id) });
      if (presence !== 'IN' || !att || shiftOfAttendance(att) !== s.id) continue;
      clockedIn += 1;
      if (!staffedEmployees.has(id)) idle += 1;
    }
    const w = windows.get(s.id)!;
    const unstaffedBookings = (bookings ?? []).filter(
      (b) => b.startsAt.getTime() < w.end.getTime() && b.endsAt.getTime() > w.start.getTime() && !staffedBookings.has(b.id),
    ).length;
    return { shiftId: s.id, name: s.name, allocated: staffedEmployees.size, clockedIn, idle, unstaffedBookings };
  });

  const hours = new Map<string, { orderNumber: string | null; phaseName: string | null; minutes: number }>();
  for (const r of rows ?? []) {
    const w = r.shiftId ? windows.get(r.shiftId) : undefined;
    if (!w) continue;
    const minutes = personMinutes({
      createdAt: r.createdAt,
      releasedAt: r.releasedAt,
      clockIn: attendanceBy.get(r.employeeId)?.clockIn ?? null,
      shiftStart: w.start,
      shiftEnd: w.end,
      bookingEnd: r.machineAllocation.endsAt,
      now,
    });
    const orderNumber = r.machineAllocation.order?.orderNumber ?? null;
    const phaseName = r.jobPhase?.process.name ?? r.machineAllocation.jobPhase?.process.name ?? null;
    const key = `${orderNumber ?? '-'}|${phaseName ?? '-'}`;
    const entry = hours.get(key) ?? { orderNumber, phaseName, minutes: 0 };
    entry.minutes += minutes;
    hours.set(key, entry);
  }

  return {
    dateKey,
    shifts: shiftRows,
    phases: [...hours.values()].map((h) => ({
      orderNumber: h.orderNumber,
      phaseName: h.phaseName,
      personHours: Math.round((h.minutes / 60) * 10) / 10,
    })),
  };
}
