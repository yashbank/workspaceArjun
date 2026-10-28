-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-167 — half-day leave. One new value on the existing mis_leave_type enum; no table or column changes.
-- Idempotent. DEPENDS ON: 20261019000000_r2_batch2_schema (creates the mis_leave_type enum).
--
-- BEFORE THIS RUNS: requesting a Half-day leave fails at the database (unknown enum value); every other
-- leave type works as before.
--
-- ROLLBACK: Postgres cannot drop an enum value. Harmless to leave: nothing reads it once unused.

ALTER TYPE mis_leave_type ADD VALUE IF NOT EXISTS 'HALF_DAY';
