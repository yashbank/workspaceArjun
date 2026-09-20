-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 7 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Phase 7 · the phase sign-off and handover gate (MIS-136/142/145/146/163/164).
-- The full state machine — states, legal transitions, who may perform each —
-- is DEVELOPMENT_GUIDE.md Appendix A. This file is its second line of defence.
--
-- Everything here is ADDITIVE and NULLABLE (MIS-145, S5). No existing row
-- changes meaning: an order with no mis_job_phases rows is exactly as gated as
-- it was yesterday, which is to say not at all (D10 — the order screen says so
-- out loud rather than letting a silent bypass read as a passed gate).
--
-- Naming note: the column is order_id, not job_card_id (D9). There is no
-- job-card table; /mis/print/job-card/[id] takes an order. D9 records what
-- changes if Arjun says one order can run two job cards at once.
--
-- updated_at carries DEFAULT now() on purpose. mis_employees.updated_at is
-- NOT NULL with no default and has bitten every raw-SQL insert since
-- (MIS_UI_SPEC.md §3); this table does not repeat that. Prisma still writes it
-- on every update via @updatedAt.

CREATE TYPE mis_job_phase_status AS ENUM (
  'PENDING', 'IN_PROGRESS', 'SIGNED_OFF', 'NOT_APPLICABLE', 'REOPENED'
);

CREATE TABLE mis_job_phases (
  id                    uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES mis_orders(id) ON DELETE CASCADE,
  process_id            uuid NOT NULL REFERENCES mis_processes(id),
  bom_stage_id          uuid REFERENCES mis_bom_stages(id) ON DELETE SET NULL,
  sequence              integer NOT NULL,
  status                mis_job_phase_status NOT NULL DEFAULT 'PENDING',
  in_charge_employee_id uuid REFERENCES mis_employees(id) ON DELETE SET NULL,
  started_at            timestamp with time zone,
  started_by_id         uuid,
  signed_off_at         timestamp with time zone,
  signed_off_by_id      uuid,
  not_applicable_reason text,
  reopen_reason         text,
  reopened_at           timestamp with time zone,
  reopened_by_id        uuid,
  downstream_flagged    boolean NOT NULL DEFAULT false,
  notes                 text,
  deleted_at            timestamp with time zone,
  created_at            timestamp with time zone NOT NULL DEFAULT now(),
  updated_at            timestamp with time zone NOT NULL DEFAULT now()
);

-- Two phases at the same position is a corrupt job card (MIS-145). Partial, so
-- a soft-deleted row does not hold its slot for ever.
CREATE UNIQUE INDEX mis_job_phases_order_sequence_key
  ON mis_job_phases (order_id, sequence) WHERE deleted_at IS NULL;

CREATE INDEX mis_job_phases_order_seq_idx ON mis_job_phases (order_id, sequence);
CREATE INDEX mis_job_phases_status_idx ON mis_job_phases (status);
CREATE INDEX mis_job_phases_in_charge_idx ON mis_job_phases (in_charge_employee_id, status);

-- The single-row rules. A hand-written INSERT cannot manufacture a signature
-- with no signer, or a skip with no reason.
ALTER TABLE mis_job_phases
  ADD CONSTRAINT mis_job_phases_signed_off_evidence_check
    CHECK (status <> 'SIGNED_OFF'
           OR (signed_off_at IS NOT NULL AND signed_off_by_id IS NOT NULL)),
  ADD CONSTRAINT mis_job_phases_not_applicable_reason_check
    CHECK (status <> 'NOT_APPLICABLE'
           OR (not_applicable_reason IS NOT NULL AND length(btrim(not_applicable_reason)) > 0)),
  ADD CONSTRAINT mis_job_phases_reopen_reason_check
    CHECK (status <> 'REOPENED'
           OR (reopen_reason IS NOT NULL AND length(btrim(reopen_reason)) > 0
               AND reopened_at IS NOT NULL)),
  ADD CONSTRAINT mis_job_phases_started_evidence_check
    CHECK (status IN ('PENDING', 'NOT_APPLICABLE') OR started_at IS NOT NULL);

-- The cross-row rule, which a CHECK constraint cannot express because it
-- cannot see sibling rows. This is the BPR's own second rule, printed on the
-- client's form: "Section receiving BPR should not accept BPR if it is not
-- signed by previous section."
--
-- It is NOT redundant with src/server/mis/job-phases.ts. The server module
-- refuses first, with a message naming the blocking phase and its in-charge —
-- that is the message users see. This trigger is for everything that never
-- goes through that module: the seed script, a migration backfill, a bulk
-- import, a psql session. Documented for debuggers in MIS_UI_SPEC.md §7.1.
CREATE OR REPLACE FUNCTION mis_job_phase_gate() RETURNS trigger AS $$
DECLARE
  blocker record;
BEGIN
  -- Only a transition INTO a running state is gated. Leaving one, or editing a
  -- row that is already running, is not this trigger's business.
  IF NEW.status <> 'IN_PROGRESS' THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'IN_PROGRESS' THEN
    RETURN NEW;
  END IF;

  -- The previous applicable phase: nearest lower sequence on the same order,
  -- skipping NOT_APPLICABLE (a skipped phase must never block the next one —
  -- MIS-145) and ignoring soft-deleted rows.
  SELECT p.sequence, p.status
    INTO blocker
    FROM mis_job_phases p
   WHERE p.order_id = NEW.order_id
     AND p.id <> NEW.id
     AND p.deleted_at IS NULL
     AND p.sequence < NEW.sequence
     AND p.status <> 'NOT_APPLICABLE'
   ORDER BY p.sequence DESC
   LIMIT 1;

  -- No applicable predecessor: this is the first real phase, and it is startable.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- REOPENED is not SIGNED_OFF and therefore blocks (Appendix A §A.2).
  IF blocker.status <> 'SIGNED_OFF' THEN
    RAISE EXCEPTION
      'mis_job_phase_gate: phase % cannot start until sequence % is signed off (it is %)',
      NEW.sequence, blocker.sequence, blocker.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mis_job_phase_gate_trg
  BEFORE INSERT OR UPDATE ON mis_job_phases
  FOR EACH ROW EXECUTE FUNCTION mis_job_phase_gate();

-- Production attribution (Appendix A §A.8) and the wastage reason (D11).
-- Both nullable: every existing row stays valid and unattributed, and the
-- 2-3 tap entry screen does not gain a required field.
-- NOTE the table is mis_production_log, singular — it always has been.
ALTER TABLE mis_production_log
  ADD COLUMN job_phase_id uuid REFERENCES mis_job_phases(id) ON DELETE SET NULL,
  ADD COLUMN waste_reason text;

CREATE INDEX mis_production_log_job_phase_idx ON mis_production_log (job_phase_id);

-- Acknowledged is not resolved (MIS-163): this records that the in-charge knew
-- about a failed check and passed the job on anyway. "Resolved" stays derived —
-- a later PASS on the same order/stage/parameter — and is deliberately not a
-- column, so the two can never be set independently and drift.
ALTER TABLE mis_qc_checks
  ADD COLUMN acknowledged_at timestamp with time zone,
  ADD COLUMN acknowledged_by_id uuid,
  ADD COLUMN acknowledgement_note text;

-- Prisma side (schema.prisma), added in the same commit:
--
--   enum MisJobPhaseStatus {
--     PENDING
--     IN_PROGRESS
--     SIGNED_OFF
--     NOT_APPLICABLE
--     REOPENED
--     @@map("mis_job_phase_status")
--   }
--
--   model MisJobPhase {
--     id                  String             @id @default(uuid()) @db.Uuid
--     orderId             String             @map("order_id") @db.Uuid
--     processId           String             @map("process_id") @db.Uuid
--     bomStageId          String?            @map("bom_stage_id") @db.Uuid
--     sequence            Int
--     status              MisJobPhaseStatus  @default(PENDING)
--     inChargeEmployeeId  String?            @map("in_charge_employee_id") @db.Uuid
--     startedAt           DateTime?          @map("started_at")
--     startedById         String?            @map("started_by_id") @db.Uuid
--     signedOffAt         DateTime?          @map("signed_off_at")
--     signedOffById       String?            @map("signed_off_by_id") @db.Uuid
--     notApplicableReason String?            @map("not_applicable_reason")
--     reopenReason        String?            @map("reopen_reason")
--     reopenedAt          DateTime?          @map("reopened_at")
--     reopenedById        String?            @map("reopened_by_id") @db.Uuid
--     downstreamFlagged   Boolean            @default(false) @map("downstream_flagged")
--     notes               String?
--     deletedAt           DateTime?          @map("deleted_at")
--     createdAt           DateTime           @default(now()) @map("created_at")
--     updatedAt           DateTime           @updatedAt @map("updated_at")
--     order               MisOrder           @relation(fields: [orderId], references: [id], onDelete: Cascade)
--     process             MisProcess         @relation(fields: [processId], references: [id])
--     bomStage            MisBomStage?       @relation(fields: [bomStageId], references: [id], onDelete: SetNull)
--     inCharge            MisEmployee?       @relation("MisJobPhaseInCharge", fields: [inChargeEmployeeId], references: [id], onDelete: SetNull)
--     productionLogs      MisProductionLog[]
--     @@index([orderId, sequence])
--     @@index([status])
--     @@index([inChargeEmployeeId, status])
--     @@map("mis_job_phases")
--   }
--
--   // on MisOrder:       jobPhases MisJobPhase[]
--   // on MisProcess:     jobPhases MisJobPhase[]
--   // on MisBomStage:    jobPhases MisJobPhase[]
--   // on MisEmployee:    jobPhasesInCharge MisJobPhase[] @relation("MisJobPhaseInCharge")
--   // on MisProductionLog: jobPhaseId String? @map("job_phase_id") @db.Uuid
--   //                      wasteReason String? @map("waste_reason")
--   //                      jobPhase MisJobPhase? @relation(...)  @@index([jobPhaseId])
--   // on MisQcCheck:     acknowledgedAt DateTime? @map("acknowledged_at")
--   //                    acknowledgedById String? @map("acknowledged_by_id") @db.Uuid
--   //                    acknowledgementNote String? @map("acknowledgement_note")
--
-- Prisma does not model CHECK constraints or triggers; they live only here and
-- `prisma migrate diff` will not see them. Do not "tidy" them away when a later
-- migration is generated — MIS-146 requires them.
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the Mac
-- before any code references MisJobPhase — tsc will not compile against a
-- client that lacks it.
--
-- Rollback:
--   ALTER TABLE mis_qc_checks
--     DROP COLUMN acknowledgement_note,
--     DROP COLUMN acknowledged_by_id,
--     DROP COLUMN acknowledged_at;
--   DROP INDEX IF EXISTS mis_production_log_job_phase_idx;
--   ALTER TABLE mis_production_log
--     DROP COLUMN waste_reason,
--     DROP COLUMN job_phase_id;
--   DROP TRIGGER IF EXISTS mis_job_phase_gate_trg ON mis_job_phases;
--   DROP FUNCTION IF EXISTS mis_job_phase_gate();
--   DROP TABLE IF EXISTS mis_job_phases;
--   DROP TYPE IF EXISTS mis_job_phase_status;
