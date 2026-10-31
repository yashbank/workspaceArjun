-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-214 / R2-216 / R2-222. Additive and idempotent: three NEW tables and two NEW enums; no existing
-- table or column is touched (breakIn/breakOut on mis_attendance and default_shift_id stay).
--
--   1. mis_shift_roster          (R2-214) dated shift per employee, inclusive range
--   2. mis_attendance_breaks     (R2-216) multi-break ledger, in_at NULL while open
--   3. mis_punch_regularizations (R2-222) missed-punch request + decision
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma.
--
-- ROLLBACK (only if you must undo; code that uses these tables must be reverted first):
--   DROP TABLE IF EXISTS mis_punch_regularizations;
--   DROP TABLE IF EXISTS mis_attendance_breaks;
--   DROP TABLE IF EXISTS mis_shift_roster;
--   DROP TYPE IF EXISTS mis_punch_regularization_status;
--   DROP TYPE IF EXISTS mis_break_kind;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261029000000_r2_shift_roster_breaks_regularization';

DO $$ BEGIN
  CREATE TYPE mis_break_kind AS ENUM ('MEAL', 'TEA', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_punch_regularization_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mis_shift_roster (
  id          UUID         NOT NULL DEFAULT gen_random_uuid(),
  employee_id UUID         NOT NULL,
  shift_id    UUID         NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  created_by  UUID,
  created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_shift_roster_pkey PRIMARY KEY (id),
  CONSTRAINT mis_shift_roster_range_ck CHECK (end_date >= start_date),
  CONSTRAINT mis_shift_roster_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES mis_employees(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT mis_shift_roster_shift_id_fkey FOREIGN KEY (shift_id)
    REFERENCES mis_shifts(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS mis_shift_roster_employee_id_start_date_idx ON mis_shift_roster(employee_id, start_date);
CREATE INDEX IF NOT EXISTS mis_shift_roster_shift_id_idx ON mis_shift_roster(shift_id);

CREATE TABLE IF NOT EXISTS mis_attendance_breaks (
  id            UUID           NOT NULL DEFAULT gen_random_uuid(),
  attendance_id UUID           NOT NULL,
  out_at        TIMESTAMP(3)   NOT NULL,
  in_at         TIMESTAMP(3),
  kind          mis_break_kind NOT NULL DEFAULT 'OTHER',
  created_at    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_attendance_breaks_pkey PRIMARY KEY (id),
  CONSTRAINT mis_attendance_breaks_attendance_id_fkey FOREIGN KEY (attendance_id)
    REFERENCES mis_attendance(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS mis_attendance_breaks_attendance_id_idx ON mis_attendance_breaks(attendance_id);

CREATE TABLE IF NOT EXISTS mis_punch_regularizations (
  id                      UUID                            NOT NULL DEFAULT gen_random_uuid(),
  employee_id             UUID                            NOT NULL,
  work_date               DATE                            NOT NULL,
  requested_in            TIMESTAMP(3),
  requested_out           TIMESTAMP(3),
  reason                  TEXT                            NOT NULL,
  status                  mis_punch_regularization_status NOT NULL DEFAULT 'PENDING',
  requested_by            UUID,
  decided_by              UUID,
  decided_at              TIMESTAMP(3),
  decision_note           TEXT,
  resulting_attendance_id UUID,
  created_at              TIMESTAMP(3)                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP(3)                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_punch_regularizations_pkey PRIMARY KEY (id),
  CONSTRAINT mis_punch_regularizations_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES mis_employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT mis_punch_regularizations_resulting_attendance_id_fkey FOREIGN KEY (resulting_attendance_id)
    REFERENCES mis_attendance(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS mis_punch_regularizations_employee_id_work_date_idx ON mis_punch_regularizations(employee_id, work_date);
CREATE INDEX IF NOT EXISTS mis_punch_regularizations_status_idx ON mis_punch_regularizations(status);
