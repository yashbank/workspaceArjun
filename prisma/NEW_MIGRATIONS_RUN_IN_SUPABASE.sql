-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-102 — leave types PAID / UNPAID (Owner-only setting, payroll pays approved leave of a PAID type).
-- Additive and idempotent: one new table, no change to any existing table or column.
--
--   1. mis_leave_pay_rules (leave_type mis_leave_type, paid, effective_from DATE, reason,
--      changed_by_id, created_at). Append-only history: a change is a new row, never an edit.
--      No seed rows — with no row the code's built-in default applies (every type unpaid, as payroll was before R2-102; the Owner turns CL/SL/EL to Paid in Settings > Leave pay).
--
-- DEPENDS ON: 20261019000000_r2_batch2_schema (creates the mis_leave_type enum). Run that first.
--
-- BEFORE THIS RUNS: payroll and the Settings > Leave pay screen read the defaults (a missing table
-- reads as "no change made yet"); saving a change says the database update is still needed.
--
-- ROLLBACK (only if you must undo; harmless to leave — the code falls back to the defaults):
--   DROP TABLE IF EXISTS mis_leave_pay_rules;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261020000000_r2_leave_pay_setting';

CREATE TABLE IF NOT EXISTS mis_leave_pay_rules (
  id              UUID           NOT NULL DEFAULT gen_random_uuid(),
  leave_type      mis_leave_type NOT NULL,
  paid            BOOLEAN        NOT NULL,
  effective_from  DATE           NOT NULL,
  reason          TEXT,
  changed_by_id   UUID,
  created_at      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_leave_pay_rules_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS mis_leave_pay_rules_leave_type_effective_from_idx
  ON mis_leave_pay_rules(leave_type, effective_from);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT 'ec07d08b-24b5-4a9e-97a6-43de229e89ec', 'b417658eb047f7bbee65813ff6eb2728d15d10cfcabe53ffe54711fd036f4371', now(), '20261020000000_r2_leave_pay_setting', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261020000000_r2_leave_pay_setting');

COMMIT;

-- verify:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'mis_leave_pay_rules';  -- expect 7 rows
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261020000000_r2_leave_pay_setting';

-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-46 follow-up (docs/qa/R2_DECISIONS.md). Additive and idempotent: one NULL column.
--
--   1. mis_document_versions.snapshot JSONB NULL — the document's rendered data (order, QC checks /
--      BOM, phases, crew, production totals) captured when a version is issued and frozen when it is
--      approved. An APPROVED version prints from it, so a reprint is stable even if the order, QC or
--      production data changes later. NULL = a version issued before this column (legacy): it prints
--      live with a "no snapshot" note until an Admin/Owner uses "Update to latest".
--
-- ORDER OF OPERATIONS: apply 20261019000000_r2_batch2_schema (which creates mis_document_versions)
-- and THIS one BEFORE deploying code built on the current schema.prisma: Prisma selects every scalar
-- column by default, so a deploy before this column exists 500s the COA and job-card print pages.
--
-- ROLLBACK (only if you must undo; code that selects this column must be reverted first):
--   ALTER TABLE mis_document_versions DROP COLUMN IF EXISTS snapshot;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261020000001_r2_doc_version_snapshot';

ALTER TABLE mis_document_versions ADD COLUMN IF NOT EXISTS snapshot JSONB;

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT 'a35fba35-14a9-4af5-b297-4d396d8225bd', '2c6a4bbb91ec8471254ae833d37ef58421ae9225ba81fa628fd94d804eca404f', now(), '20261020000001_r2_doc_version_snapshot', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261020000001_r2_doc_version_snapshot');

COMMIT;

-- verify:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'mis_document_versions' AND column_name = 'snapshot';  -- expect 1 row, jsonb
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261020000001_r2_doc_version_snapshot';
