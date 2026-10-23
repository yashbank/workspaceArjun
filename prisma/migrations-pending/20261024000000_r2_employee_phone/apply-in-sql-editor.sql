-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-91. Additive and idempotent: one NULL column.
--
--   1. mis_employees.phone TEXT NULL — emergency factory contact. Never an auth channel: no login
--      or OTP is ever sent here, same boundary the codebase already draws for MisCustomer.phone and
--      MisSupplier.phone (contact info, not credentials).
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma — Prisma
-- selects every scalar column by default, so a deploy before this column exists 500s the Employees
-- screen.
--
-- ROLLBACK (only if you must undo; code that selects this column must be reverted first):
--   ALTER TABLE mis_employees DROP COLUMN IF EXISTS phone;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261024000000_r2_employee_phone';

ALTER TABLE mis_employees ADD COLUMN IF NOT EXISTS phone TEXT;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '58680aab-bcf6-4cc3-ab8c-757d2a2af3f5', 'da0582ce406757b06b7a5af447397dd2408b9e34916a57a280130b5ab3ed42a9', now(), '20261024000000_r2_employee_phone', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261024000000_r2_employee_phone');

COMMIT;

-- verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mis_employees' AND column_name = 'phone';  -- expect 1 row, text
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261024000000_r2_employee_phone';
