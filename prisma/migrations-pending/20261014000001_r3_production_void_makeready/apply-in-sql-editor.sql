-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R3-S0 file 1 (for R3-S1): void + makeready on production entries and QC checks. Additive, idempotent.
--
--   * mis_production_log: voided_at, void_reason, makeready_minutes (all NULL)
--   * mis_qc_checks:      voided_at, void_reason (all NULL)
--   * CHECKs: void pair (voided_at and void_reason are both set or both null) on both tables;
--     makeready_minutes NULL or 0..1440
--
-- ORDER OF OPERATIONS: any time after Deploy 1 (additive, safe for running code). schema.prisma is
-- changed later by step SG; do not merge SG before this is applied.
--
-- ROLLBACK (only if you must undo; code that selects these columns must be reverted first):
--   ALTER TABLE mis_production_log DROP CONSTRAINT IF EXISTS mis_production_log_void_pair_ck;
--   ALTER TABLE mis_production_log DROP CONSTRAINT IF EXISTS mis_production_log_makeready_ck;
--   ALTER TABLE mis_qc_checks DROP CONSTRAINT IF EXISTS mis_qc_checks_void_pair_ck;
--   ALTER TABLE mis_production_log DROP COLUMN IF EXISTS voided_at, DROP COLUMN IF EXISTS void_reason, DROP COLUMN IF EXISTS makeready_minutes;
--   ALTER TABLE mis_qc_checks DROP COLUMN IF EXISTS voided_at, DROP COLUMN IF EXISTS void_reason;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261014000001_r3_production_void_makeready';

ALTER TABLE mis_production_log
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS makeready_minutes INTEGER;

ALTER TABLE mis_qc_checks
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

DO $$ BEGIN
  ALTER TABLE mis_production_log
    ADD CONSTRAINT mis_production_log_void_pair_ck CHECK ((voided_at IS NULL) = (void_reason IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE mis_qc_checks
    ADD CONSTRAINT mis_qc_checks_void_pair_ck CHECK ((voided_at IS NULL) = (void_reason IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE mis_production_log
    ADD CONSTRAINT mis_production_log_makeready_ck CHECK (makeready_minutes IS NULL OR makeready_minutes BETWEEN 0 AND 1440);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '7b05cabd-efe7-49c4-baba-2bbb950ac1c5', '873a3c1dd0a631097a7ebc6a6c2e1ebff81f7481a1fa0b4d6fdcd66809f21964', now(), '20261014000001_r3_production_void_makeready', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261014000001_r3_production_void_makeready');

COMMIT;

-- verify:
-- SELECT column_name FROM information_schema.columns WHERE table_name IN ('mis_production_log','mis_qc_checks') AND column_name IN ('voided_at','void_reason','makeready_minutes');  -- expect 5 rows
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261014000001_r3_production_void_makeready';
