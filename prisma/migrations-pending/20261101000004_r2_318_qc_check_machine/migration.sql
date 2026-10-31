-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (`pnpm db:deploy` after moving this
-- folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-318. Additive: one nullable column. mis_qc_checks.machine_id UUID NULL -> mis_machines(id): the machine the
-- inspection was taken at. NULL on every older check: the defect report keeps attributing those by the booking at
-- the check time, exactly as before.
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma.
--
-- ROLLBACK (only after reverting the code that selects this column):
--   ALTER TABLE mis_qc_checks DROP COLUMN IF EXISTS machine_id;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101000004_r2_318_qc_check_machine';

ALTER TABLE mis_qc_checks ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES mis_machines(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mis_qc_checks_machine_id_idx ON mis_qc_checks(machine_id);
