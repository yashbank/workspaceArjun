-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R3-S0 file 2 (for R3-S2): default shift on employees + release/crew-role columns on worker
-- allocations + the open-row partial unique index. Additive, idempotent.
--
--   * mis_employees.default_shift_id UUID NULL, FK -> mis_shifts(id) ON DELETE SET NULL, index
--   * mis_worker_allocations: released_by_id UUID NULL, release_reason TEXT NULL (CHECK, 6 values),
--     crew_role TEXT NULL (CHECK OPERATOR/HELPER/INCHARGE)
--   * partial unique index mis_worker_allocations_open_uq (Prisma cannot model it; the SG schema
--     comment names it). A DO block raises first, aborting the whole transaction with the duplicate
--     count, if any open duplicate rows exist, so nothing is half-applied.
--
-- ORDER OF OPERATIONS: any time after Deploy 1. If it aborts with "duplicate open worker rows",
-- nothing is applied: send the message to the orchestrator.
--
-- ROLLBACK (only if you must undo; code that selects these columns must be reverted first):
--   DROP INDEX IF EXISTS mis_worker_allocations_open_uq;
--   ALTER TABLE mis_worker_allocations DROP CONSTRAINT IF EXISTS mis_worker_allocations_release_reason_ck;
--   ALTER TABLE mis_worker_allocations DROP CONSTRAINT IF EXISTS mis_worker_allocations_crew_role_ck;
--   ALTER TABLE mis_employees DROP CONSTRAINT IF EXISTS mis_employees_default_shift_id_fkey;
--   DROP INDEX IF EXISTS mis_employees_default_shift_id_idx;
--   ALTER TABLE mis_worker_allocations DROP COLUMN IF EXISTS released_by_id, DROP COLUMN IF EXISTS release_reason, DROP COLUMN IF EXISTS crew_role;
--   ALTER TABLE mis_employees DROP COLUMN IF EXISTS default_shift_id;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261014000002_r3_worker_allocation_default_shift';

ALTER TABLE mis_employees
  ADD COLUMN IF NOT EXISTS default_shift_id UUID;

DO $$ BEGIN
  ALTER TABLE mis_employees
    ADD CONSTRAINT mis_employees_default_shift_id_fkey
    FOREIGN KEY (default_shift_id) REFERENCES mis_shifts(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS mis_employees_default_shift_id_idx ON mis_employees(default_shift_id);

ALTER TABLE mis_worker_allocations
  ADD COLUMN IF NOT EXISTS released_by_id UUID,
  ADD COLUMN IF NOT EXISTS release_reason TEXT,
  ADD COLUMN IF NOT EXISTS crew_role TEXT;

DO $$ BEGIN
  ALTER TABLE mis_worker_allocations
    ADD CONSTRAINT mis_worker_allocations_release_reason_ck CHECK (
      release_reason IS NULL OR release_reason IN ('MANUAL','MOVED','PHASE_SIGNED_OFF','MACHINE_RELEASED','ORDER_CLOSED','CLOCKED_OUT'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE mis_worker_allocations
    ADD CONSTRAINT mis_worker_allocations_crew_role_ck CHECK (
      crew_role IS NULL OR crew_role IN ('OPERATOR','HELPER','INCHARGE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Abort cleanly (whole transaction) if duplicate open rows would make the unique index fail.
DO $$
DECLARE dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT 1
      FROM mis_worker_allocations
     WHERE released_at IS NULL AND deleted_at IS NULL
     GROUP BY employee_id, allocation_date,
              COALESCE(shift_id, '00000000-0000-0000-0000-000000000000'::uuid), machine_allocation_id
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'duplicate open worker rows: % group(s); nothing applied. Send this message to the orchestrator.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS mis_worker_allocations_open_uq
  ON mis_worker_allocations (employee_id, allocation_date,
                             COALESCE(shift_id, '00000000-0000-0000-0000-000000000000'::uuid),
                             machine_allocation_id)
  WHERE released_at IS NULL AND deleted_at IS NULL;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT 'ec8b5508-0e56-412c-ab33-3b30ff0f3878', 'e2b8ec85f3f2ad12c8db1997cf0b887ab3ea4368b0bc77ba3960da7ed3a43cbb', now(), '20261014000002_r3_worker_allocation_default_shift', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261014000002_r3_worker_allocation_default_shift');

COMMIT;

-- verify:
-- SELECT column_name FROM information_schema.columns WHERE (table_name='mis_employees' AND column_name='default_shift_id') OR (table_name='mis_worker_allocations' AND column_name IN ('released_by_id','release_reason','crew_role'));  -- expect 4 rows
-- SELECT indexname FROM pg_indexes WHERE indexname='mis_worker_allocations_open_uq';  -- expect 1 row
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261014000002_r3_worker_allocation_default_shift';
