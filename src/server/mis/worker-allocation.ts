import type { MisWorkerAllocation } from '@/generated/prisma/client';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { isActiveStatus } from '@/server/mis/job-phases';
import { resolveVisibleEmployeeWhere } from '@/server/mis/visibility';

/**
 * Worker allocation — MIS-260/262. Mirrors `machines-board.ts`'s allocation
 * pattern for people rather than inventing a second one, with one deliberate
 * asymmetry: see `assignWorkers` below.
 *
 * Pool visibility applies to the *candidates* here (D4/D5 — people narrow by
 * pool, machines do not). `machineAllocationId` itself is never filtered by
 * pool; only the employee list a supervisor may staff it with is.
 */

const WORKABLE_ROLES = ['WORKER', 'QC'] as const;

/** Mirrors PRESENT_STATUSES in attendance.ts — small enough that importing it is not worth the coupling. */
const PRESENT_STATUSES = ['PRESENT', 'HALF_DAY', 'LATE'];

function atMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const allocationInclude = {
  machineAllocation: {
    include: {
      machine: { select: { id: true, name: true } },
      order: { select: { orderNumber: true } },
    },
  },
  jobPhase: { include: { process: { select: { name: true } } } },
} as const;

export type WorkerOverlapWarning = {
  employeeId: string;
  employeeName: string;
  conflictingAllocationId: string;
  conflictingMachineName: string;
  conflictingProcessName: string | null;
  conflictingOrderNumber: string | null;
};

export type AssignWorkersInput = {
  machineAllocationId: string;
  employeeIds: string[];
  shiftId: string;
  allocationDate: Date;
  jobPhaseId?: string;
  /** Employee ids the caller has already seen the warning for and wants assigned anyway. */
  confirmOverlapFor?: string[];
  notes?: string;
};

/**
 * Assign a crew to a machine allocation, one action for however many people
 * (MIS-263: "a crew of four is assigned in one action").
 *
 * Overlap is asymmetric with `allocateMachine()` in `machines-board.ts` ON
 * PURPOSE. A machine cannot physically run two jobs, so that function refuses
 * an overlap outright. A person genuinely can be pulled between jobs mid-
 * shift, so this one only WARNS — naming the conflicting job and machine
 * (MIS-263) — and proceeds only for employees the caller explicitly confirmed
 * via `confirmOverlapFor`. Do not "fix" this into a refusal; MIS-262 asks for
 * exactly this comment so nobody does.
 *
 * An employee already on *this same* machine allocation for this date/shift
 * is silently a no-op, not a warning — re-submitting a crew that includes
 * someone already staffed is the normal shape of "add two more people".
 */
export async function assignWorkers(input: AssignWorkersInput): Promise<{
  created: MisWorkerAllocation[];
  warnings: WorkerOverlapWarning[];
  alreadyAssigned: string[];
}> {
  const actor = await requirePermission('production.write');

  const machineAllocation = await db.misMachineAllocation.findUnique({
    where: { id: input.machineAllocationId },
  });
  if (!machineAllocation) throw new Error('That machine allocation no longer exists.');
  if (machineAllocation.releasedAt) throw new Error('That machine allocation has already ended.');

  // Phase 9 (MIS-265): the phase must belong to the same order as the
  // machine allocation being staffed — a cross-linked phase would corrupt
  // both the order board and the utilisation report. This closes the gap
  // Phase 8 left: assignWorkers() has accepted jobPhaseId since it was added,
  // but never validated it until now.
  if (input.jobPhaseId) {
    const phase = await db.misJobPhase.findFirst({
      where: { id: input.jobPhaseId, deletedAt: null },
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

  const allocationDate = atMidnight(input.allocationDate);
  const confirmSet = new Set(input.confirmOverlapFor ?? []);

  const employees = await db.misEmployee.findMany({
    where: { id: { in: input.employeeIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  const created: MisWorkerAllocation[] = [];
  const warnings: WorkerOverlapWarning[] = [];
  const alreadyAssigned: string[] = [];

  for (const employeeId of input.employeeIds) {
    const existing = await db.misWorkerAllocation.findFirst({
      where: {
        employeeId,
        allocationDate,
        shiftId: input.shiftId,
        releasedAt: null,
        deletedAt: null,
      },
      include: allocationInclude,
    });

    if (existing) {
      if (existing.machineAllocationId === input.machineAllocationId) {
        alreadyAssigned.push(employeeId);
        continue;
      }
      if (!confirmSet.has(employeeId)) {
        warnings.push({
          employeeId,
          employeeName: nameById.get(employeeId) ?? 'This worker',
          conflictingAllocationId: existing.id,
          conflictingMachineName: existing.machineAllocation.machine.name,
          conflictingProcessName: existing.jobPhase?.process.name ?? null,
          conflictingOrderNumber: existing.machineAllocation.order?.orderNumber ?? null,
        });
        continue;
      }
      // Confirmed despite the conflict — proceed, and say so in the audit trail.
    }

    const rec = await db.misWorkerAllocation.create({
      data: {
        machineAllocationId: input.machineAllocationId,
        employeeId,
        jobPhaseId: input.jobPhaseId ?? null,
        shiftId: input.shiftId,
        allocationDate,
        assignedById: actor.userId,
        notes: input.notes ?? null,
      },
    });
    created.push(rec);

    await logAuditEvent({
      actorId: actor.userId,
      action: 'ASSIGN_WORKER',
      entity: 'MisWorkerAllocation',
      entityId: rec.id,
      after: {
        employeeId,
        machineAllocationId: input.machineAllocationId,
        shiftId: input.shiftId,
        confirmedOverConflictWith: existing ? existing.id : null,
      },
    });
  }

  return { created, warnings, alreadyAssigned };
}

/** Release date/end preserved on the underlying machine allocation; this only marks the person off it. */
export async function releaseWorker(workerAllocationId: string) {
  const actor = await requirePermission('production.write');
  const rec = await db.misWorkerAllocation.update({
    where: { id: workerAllocationId },
    data: { releasedAt: new Date() },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'RELEASE_WORKER',
    entity: 'MisWorkerAllocation',
    entityId: rec.id,
    after: { releasedAt: rec.releasedAt?.toISOString() ?? null },
  });
  return rec;
}

export type WorkerAvailabilityRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  clockedIn: boolean;
  allocation: {
    workerAllocationId: string;
    machineId: string;
    machineName: string;
    orderNumber: string | null;
    processName: string | null;
  } | null;
};

/**
 * Free, or assigned with the job and machine — for the whole pool, in three
 * queries total regardless of headcount (S8: "seventy employees is seventy
 * queries if done naively"). Availability is *derived* here every time, never
 * read from a stored column (D4) — the same discipline machine status uses.
 *
 * Pool-scoped (D4/D5): only WORKER/QC employees within the caller's
 * visibility subtree. Machines are not scoped by the same rule — see
 * `visibility.ts`'s own comment on `resolveVisibleMachineWhere` — but nothing
 * here touches a machine's visibility, only whom it may be staffed with.
 */
export async function getWorkerAvailability(shiftId: string, date: Date): Promise<WorkerAvailabilityRow[]> {
  const actor = await requirePermission('production.read');
  const allocationDate = atMidnight(date);

  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const employees = await db.misEmployee.findMany({
    where: { ...poolWhere, role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true, name: true, employeeCode: true },
    orderBy: { name: 'asc' },
  });
  if (employees.length === 0) return [];

  const employeeIds = employees.map((e) => e.id);

  const [allocations, attendanceRows] = await Promise.all([
    db.misWorkerAllocation.findMany({
      where: { employeeId: { in: employeeIds }, allocationDate, shiftId, releasedAt: null, deletedAt: null },
      include: allocationInclude,
    }),
    // E3 (attendance) is built, so this degrades honestly rather than hiding
    // the column (MIS-263) — a genuinely unbuilt E3 would leave clockedIn
    // always false, which is why the FE must not read this as "absent".
    db.misAttendance.findMany({
      where: { employeeId: { in: employeeIds }, date: allocationDate, clockIn: { not: null } },
      select: { employeeId: true },
    }),
  ]);

  const allocByEmployee = new Map(allocations.map((a) => [a.employeeId, a]));
  const clockedInSet = new Set(attendanceRows.map((r) => r.employeeId));

  return employees.map((e) => {
    const alloc = allocByEmployee.get(e.id);
    return {
      employeeId: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
      clockedIn: clockedInSet.has(e.id),
      allocation: alloc
        ? {
            workerAllocationId: alloc.id,
            machineId: alloc.machineAllocation.machine.id,
            machineName: alloc.machineAllocation.machine.name,
            orderNumber: alloc.machineAllocation.order?.orderNumber ?? null,
            processName: alloc.jobPhase?.process.name ?? null,
          }
        : null,
    };
  });
}

export type CrewSummary = {
  present: number;
  headcount: number;
  absent: number;
  onLeave: number;
  recorded: boolean;
};

/**
 * "My crew today 14/17" (`R2-Supervisor.png`) — pool-scoped, unlike
 * `getDayAttendanceSummary()` in `attendance.ts`, which is deliberately
 * factory-wide for the attendance operator's home (its own doc comment
 * explains why). This is the same present/absent/on-leave arithmetic, scoped
 * to WORKER/QC employees in the caller's D4 subtree.
 */
export async function getCrewSummary(date: Date = new Date()): Promise<CrewSummary> {
  const actor = await requirePermission('attendance.read');
  const d = atMidnight(date);

  const poolWhere = await resolveVisibleEmployeeWhere(actor);
  const pool = await db.misEmployee.findMany({
    where: { ...poolWhere, role: { in: [...WORKABLE_ROLES] }, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const headcount = pool.length;
  if (headcount === 0) return { present: 0, headcount: 0, absent: 0, onLeave: 0, recorded: false };
  const poolIds = pool.map((p) => p.id);

  const [records, leaves] = await Promise.all([
    db.misAttendance.findMany({
      where: { employeeId: { in: poolIds }, date: d },
      select: { employeeId: true, status: true, clockIn: true },
    }),
    db.misLeaveRequest.findMany({
      where: { employeeId: { in: poolIds }, date: d, status: 'APPROVED' },
      select: { employeeId: true },
    }),
  ]);

  const onLeaveIds = new Set(leaves.map((l) => l.employeeId));
  for (const r of records) if (r.status === 'LEAVE') onLeaveIds.add(r.employeeId);

  const present = records.filter(
    (r) => !onLeaveIds.has(r.employeeId) && (r.clockIn !== null || PRESENT_STATUSES.includes(r.status)),
  ).length;

  return {
    headcount,
    present,
    onLeave: onLeaveIds.size,
    absent: Math.max(0, headcount - present - onLeaveIds.size),
    recorded: records.length > 0,
  };
}
