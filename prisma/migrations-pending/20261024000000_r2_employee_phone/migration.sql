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
