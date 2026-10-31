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
