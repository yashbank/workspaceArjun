-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 8 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Phase 8 · worker allocation to process, machine and shift (MIS-260/262/263).
--
-- Hangs off mis_machine_allocations rather than duplicating job, process and
-- time — the worker row just points at the window that already exists.
--
-- IMPORTANT — no overlap constraint here, on purpose (MIS-262). Machines get
-- one (mis_machine_allocations' overlap is refused in application code by
-- allocateMachine() in machines-board.ts, not a DB constraint either — there
-- is in fact no exclusion constraint anywhere in this schema yet). Workers
-- get neither a DB constraint nor an application refusal: a person can
-- genuinely be pulled between jobs mid-shift, so assignWorkers() in
-- worker-allocation.ts WARNS on a conflict and proceeds only on confirmation,
-- recording that it happened. Do not add a UNIQUE or EXCLUDE constraint here
-- later without re-reading MIS-262 first — it explicitly asks for a comment
-- so nobody "fixes" this into a hard block.

CREATE TABLE mis_worker_allocations (
  id                    uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_allocation_id uuid NOT NULL REFERENCES mis_machine_allocations(id),
  employee_id           uuid NOT NULL REFERENCES mis_employees(id),
  job_phase_id          uuid REFERENCES mis_job_phases(id) ON DELETE SET NULL,
  shift_id              uuid REFERENCES mis_shifts(id) ON DELETE SET NULL,
  allocation_date       date NOT NULL,
  assigned_by_id        uuid,
  released_at           timestamp with time zone,
  notes                 text,
  deleted_at            timestamp with time zone,
  created_at            timestamp with time zone NOT NULL DEFAULT now()
);

-- The overlap-lookup index: "is this employee already assigned on this date,
-- this shift, somewhere else" is the query assignWorkers() runs before every
-- write.
CREATE INDEX mis_worker_allocations_employee_date_shift_idx
  ON mis_worker_allocations (employee_id, allocation_date, shift_id);

-- "Everyone on this machine allocation" — the board's other axis.
CREATE INDEX mis_worker_allocations_machine_allocation_idx
  ON mis_worker_allocations (machine_allocation_id);

-- Prisma side (schema.prisma), added in the same commit:
--
--   model MisWorkerAllocation {
--     id                  String               @id @default(uuid()) @db.Uuid
--     machineAllocationId String               @map("machine_allocation_id") @db.Uuid
--     employeeId          String               @map("employee_id") @db.Uuid
--     jobPhaseId          String?              @map("job_phase_id") @db.Uuid
--     shiftId             String?              @map("shift_id") @db.Uuid
--     allocationDate      DateTime             @map("allocation_date") @db.Date
--     assignedById        String?              @map("assigned_by_id") @db.Uuid
--     releasedAt          DateTime?            @map("released_at")
--     notes               String?
--     deletedAt           DateTime?            @map("deleted_at")
--     createdAt           DateTime             @default(now()) @map("created_at")
--     machineAllocation   MisMachineAllocation @relation(fields: [machineAllocationId], references: [id])
--     employee            MisEmployee          @relation(fields: [employeeId], references: [id])
--     jobPhase            MisJobPhase?         @relation(fields: [jobPhaseId], references: [id], onDelete: SetNull)
--     shift               MisShift?            @relation(fields: [shiftId], references: [id], onDelete: SetNull)
--     @@index([employeeId, allocationDate, shiftId])
--     @@index([machineAllocationId])
--     @@map("mis_worker_allocations")
--   }
--
--   // on MisMachineAllocation: workerAllocations MisWorkerAllocation[]
--   // on MisEmployee:          workerAllocations MisWorkerAllocation[]
--   // on MisJobPhase:          workerAllocations MisWorkerAllocation[]
--   // on MisShift:             workerAllocations MisWorkerAllocation[]
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references MisWorkerAllocation — tsc will not compile
-- against a client that lacks it.
--
-- Rollback:
--   DROP TABLE IF EXISTS mis_worker_allocations;
