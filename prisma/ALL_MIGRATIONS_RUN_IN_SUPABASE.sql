-- NOT APPLIED. Parked in prisma/migrations-pending/ for a human to run via
-- `pnpm db:deploy` (never applied by an agent directly — no DDL via the Supabase
-- MCP connector, which is read-only here). schema.prisma already carries the
-- matching fields and `pnpm db:generate` has been run against them, but no
-- application code reads or writes `version`/`lastApprovedSnapshot` yet — that
-- is deliberately deferred to a follow-up change, AFTER this migration is
-- confirmed applied, so nothing ships that queries a column the live database
-- does not have yet.
--
-- Track 4 (Phase 28) — E5-05 (MIS-104/121/122): BOM approval gate and versioning.
--
-- F-37's own finding was that `approveBom`/`submitBomForApproval` had no status guard at all —
-- fixed at the server-function level (`src/server/mis/bom.ts`, shipped in this same PR, no
-- schema change needed for that half). This migration is the OTHER half, prepared but not yet
-- live: the design artboard `P5-Approval-queue.png` (MIS-122) labels every queued BOM "BOM v2"
-- and "Changed since v1 · 3 lines" — a version number and a diff against the last approved cut,
-- so a second approval means something instead of being a rubber stamp. Both are additive,
-- backward-compatible columns; nothing existing reads them.
--
-- version: starts at 1 (the first, never-yet-approved draft). Bumped by `reopenBom` when an
-- already-APPROVED BOM is reopened for further changes — the only path back to DRAFT.
--
-- last_approved_snapshot: a JSON snapshot of the BOM's materials (stageId, materialId,
-- description, quantity, ratePerUnit) taken at the moment of its last approval. Nothing but the
-- approvals queue reads it (to compute "changed since vN"); it is never used for costing itself —
-- `getBomCosting` always reads the live rows.

ALTER TABLE mis_bom
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_approved_snapshot JSONB;

-- Prisma side (schema.prisma), added in the same commit:
--
--   model MisBom {
--     ...
--     version              Int    @default(1)
--     lastApprovedSnapshot Json?  @map("last_approved_snapshot") @db.JsonB
--     ...
--   }
--
-- Then `pnpm db:generate`.
--
-- Rollback:
--   ALTER TABLE mis_bom DROP COLUMN IF EXISTS version, DROP COLUMN IF EXISTS last_approved_snapshot;
-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- F6 / V2 Epic 1 — 3-way match status on supplier invoices. Additive and idempotent.
--
--   * enum  mis_supplier_invoice_status (MATCHED, DISCREPANCY_QTY, DISCREPANCY_PRICE, PENDING_REVIEW)
--   * column mis_supplier_invoices.status NOT NULL DEFAULT 'PENDING_REVIEW' (existing rows get the default
--     instantly; constant default, no table rewrite)
--   * index  mis_supplier_invoices_status_idx
--   * backfill: every row still at PENDING_REVIEW is re-computed with the SAME rule the app uses
--     (src/lib/mis/invoice-match.ts):
--       expected = SUM( COALESCE(dc_quantity, received_qty) * po rate ) over the invoice's GRN lines
--       DISCREPANCY_PRICE  invoice_amount present and |invoice_amount - expected| > GREATEST(1.00, 0.5% of expected)
--       DISCREPANCY_QTY    any line with a dc_quantity differing from received_qty by more than 0.01
--       PENDING_REVIEW     no GRN lines, no invoice amount, or expected = 0
--       MATCHED            otherwise
--     (price outranks qty). Re-running is safe: only PENDING_REVIEW rows are touched.
--
-- ORDER OF OPERATIONS (do not skip): run this SQL FIRST, then merge the code PR. The PR's
-- schema.prisma selects `status` on every MisSupplierInvoice query; merging before the column exists
-- would 500 every page that includes it.
--
-- ROLLBACK (only if you must undo; the app code that reads `status` must be reverted first):
--   DROP INDEX IF EXISTS mis_supplier_invoices_status_idx;
--   ALTER TABLE mis_supplier_invoices DROP COLUMN IF EXISTS status;
--   DROP TYPE IF EXISTS mis_supplier_invoice_status;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261012000000_mis_supplier_invoice_status';

DO $$ BEGIN
  CREATE TYPE mis_supplier_invoice_status AS ENUM ('MATCHED', 'DISCREPANCY_QTY', 'DISCREPANCY_PRICE', 'PENDING_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE mis_supplier_invoices
  ADD COLUMN IF NOT EXISTS status mis_supplier_invoice_status NOT NULL DEFAULT 'PENDING_REVIEW';

CREATE INDEX IF NOT EXISTS mis_supplier_invoices_status_idx ON mis_supplier_invoices(status);

-- Backfill (same rule as the app; see header).
WITH agg AS (
  SELECT
    si.id,
    si.invoice_amount,
    COUNT(gi.id) AS n_lines,
    COALESCE(SUM(COALESCE(gi.dc_quantity, gi.received_qty) * pi.rate_per_unit), 0) AS expected,
    COALESCE(BOOL_OR(gi.dc_quantity IS NOT NULL AND ABS(gi.dc_quantity - gi.received_qty) > 0.01), FALSE) AS qty_disc
  FROM mis_supplier_invoices si
  LEFT JOIN mis_grn_items gi ON gi.grn_id = si.grn_id
  LEFT JOIN mis_po_items pi ON pi.id = gi.po_item_id
  WHERE si.status = 'PENDING_REVIEW'
  GROUP BY si.id, si.invoice_amount
),
decided AS (
  SELECT
    id,
    CASE
      WHEN n_lines = 0 THEN 'PENDING_REVIEW'
      WHEN invoice_amount IS NOT NULL
           AND ABS(invoice_amount - expected) > GREATEST(1.00, ROUND(expected * 0.005, 4)) THEN 'DISCREPANCY_PRICE'
      WHEN qty_disc THEN 'DISCREPANCY_QTY'
      WHEN invoice_amount IS NULL OR expected = 0 THEN 'PENDING_REVIEW'
      ELSE 'MATCHED'
    END::mis_supplier_invoice_status AS new_status
  FROM agg
)
UPDATE mis_supplier_invoices si
   SET status = d.new_status
  FROM decided d
 WHERE si.id = d.id
   AND d.new_status <> 'PENDING_REVIEW';

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '80863050-eed3-4a13-88ee-42e347d07f51', '767929960d41a03c79b4afbbd3f5fe4ef25fcb367f9767dfecab1a878223343a', now(), '20261012000000_mis_supplier_invoice_status', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261012000000_mis_supplier_invoice_status');

COMMIT;

-- verify:
-- SELECT status, COUNT(*) FROM mis_supplier_invoices GROUP BY 1;
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '20261012%';

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

-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R3-S0 file 3 (for R3-S2): mis_items.unit from enum "MisItemUnit" to TEXT + seed UNIT master
-- options. The only type change in R3: apply it LAST, the same day as Deploy 2, just before it.
--
-- Between applying this and deploying R3-S2, the running app keeps writing the 4 enum values into a
-- TEXT column (Postgres assignment cast). Verified: no code filters `where: { unit }`.
--
--   * the ALTER TYPE step is wrapped in a DO block that skips when the column is already text
--   * the "MisItemUnit" type is kept (rollback needs it)
--   * UNIT options KG/LITRE/PIECE/REAM are seeded only where no non-deleted row exists for that value
--
-- ORDER OF OPERATIONS: after files 1 and 2 and after SG; same day as Deploy 2, just before it.
--
-- ROLLBACK (valid only while every mis_items.unit is one of KG, LITRE, PIECE, REAM; leave the
-- seeded options in place). Run the first SELECT; it must return 0 rows:
--   SELECT id, unit FROM mis_items WHERE unit NOT IN ('KG','LITRE','PIECE','REAM');
--   ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT;
--   ALTER TABLE mis_items ALTER COLUMN unit TYPE "MisItemUnit" USING unit::"MisItemUnit";
--   ALTER TABLE mis_items ALTER COLUMN unit SET DEFAULT 'KG'::"MisItemUnit";
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'mis_items'
                AND column_name = 'unit' AND data_type <> 'text') THEN
    ALTER TABLE mis_items ALTER COLUMN unit DROP DEFAULT;
    ALTER TABLE mis_items ALTER COLUMN unit TYPE TEXT USING unit::text;
    ALTER TABLE mis_items ALTER COLUMN unit SET DEFAULT 'KG';
  END IF;
END $$;

INSERT INTO mis_master_options (id, "group", value, label, sort_order, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), 'UNIT', v.value, v.label, v.sort_order, true, now(), now()
    FROM (VALUES ('KG', 'Kg', 10), ('LITRE', 'Litre', 20), ('PIECE', 'Piece', 30), ('REAM', 'Ream', 40))
         AS v(value, label, sort_order)
   WHERE NOT EXISTS (SELECT 1 FROM mis_master_options o
                      WHERE o."group" = 'UNIT' AND o.value = v.value AND o.deleted_at IS NULL);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '98b1a863-3fb4-43f9-9366-dce5d5f5deec', '639fc45b0105843c16542dc6c019eb48c5555bd16a7cdbdb13be01e7b4d5ee6b', now(), '20261014000003_r3_item_unit_text', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text');

COMMIT;

-- verify:
-- SELECT data_type FROM information_schema.columns WHERE table_name='mis_items' AND column_name='unit';  -- expect text
-- SELECT value, label, sort_order FROM mis_master_options WHERE "group"='UNIT' AND deleted_at IS NULL ORDER BY sort_order;
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261014000003_r3_item_unit_text';

-- Run this whole file in the Supabase SQL editor: migration.sql + the Prisma ledger row.
-- The checksum is sha256 of migration.sql, so a later `pnpm db:deploy` sees it as applied.
-- If migration.sql is edited, regenerate: shasum -a 256 migration.sql

BEGIN;

-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R2 batch #2 (docs/qa/R2_DECISIONS.md). Additive and idempotent: every column is NULL or has a
-- constant default, every new FK is nullable on existing tables, enums/constraints are created in
-- DO blocks that swallow duplicate_object, and the master-option seed skips existing values.
--
--   1. mis_employees: bank_name, bank_account_no, ifsc                         (R2-110)
--   2. mis_leave_requests: end_date (NULL = single day, CHECK >= date),
--      leave_type mis_leave_type NOT NULL DEFAULT 'OTHER'                       (R2-101/102)
--   3. mis_payslip_releases (employee_id, year, month UNIQUE)                   (R2-111)
--   4. mis_document_versions (doc_type COA|JOB_CARD, ref_id, version UNIQUE)    (R2-46)
--   5. mis_machine_allocations: source mis_machine_allocation_source
--      NOT NULL DEFAULT 'SCHEDULED', production_log_id UUID NULL UNIQUE FK      (R2-40/41/45)
--   6. worker lock: NO new columns. released_at already exists; released_by_id/release_reason/
--      crew_role come from parked 20261014000002; the holder supervisor is assigned_by_id. (R2-47)
--   7. mis_pick_lists + mis_pick_list_lines                                     (R2-77)
--   8. mis_store_returns (ledger_id / store_txn_id links)                       (R2-79)
--   9. mis_material_requests + mis_store_transactions: is_general, general_reason, cost_center;
--      mis_store_transactions.material_request_id UUID NULL FK                  (R2-80/62/Q11)
--  10. mis_master_options seed: GSM/SIZE/SUBSTRATE/COATING from the distinct values already on
--      mis_items; COST_CENTER from department names + 'GENERAL'. (UNIT is seeded by 20261014000003.)
--
-- ORDER OF OPERATIONS: apply ALL parked migrations (20261004000000, 20261012000000, 20261014000001,
-- 20261014000002, 20261014000003) and THIS one BEFORE deploying code built on the current
-- schema.prisma: Prisma selects every scalar column by default, so a deploy before these columns
-- exist 500s every page touching the affected models. This file has no dependency on the others
-- except that it is safe to run after them.
--
-- ROLLBACK (only if you must undo; code that selects these columns must be reverted first):
--   DELETE FROM mis_master_options WHERE "group" IN ('GSM','SIZE','SUBSTRATE','COATING','COST_CENTER')
--     AND created_at >= '<apply timestamp>';   -- optional; harmless to leave
--   DROP TABLE IF EXISTS mis_store_returns;
--   DROP TABLE IF EXISTS mis_pick_list_lines;
--   DROP TABLE IF EXISTS mis_pick_lists;
--   DROP TABLE IF EXISTS mis_document_versions;
--   DROP TABLE IF EXISTS mis_payslip_releases;
--   ALTER TABLE mis_store_transactions DROP CONSTRAINT IF EXISTS mis_store_transactions_material_request_id_fkey;
--   DROP INDEX IF EXISTS mis_store_transactions_material_request_id_idx;
--   DROP INDEX IF EXISTS mis_store_transactions_is_general_idx;
--   ALTER TABLE mis_store_transactions DROP COLUMN IF EXISTS is_general, DROP COLUMN IF EXISTS general_reason,
--     DROP COLUMN IF EXISTS cost_center, DROP COLUMN IF EXISTS material_request_id;
--   DROP INDEX IF EXISTS mis_material_requests_is_general_idx;
--   ALTER TABLE mis_material_requests DROP COLUMN IF EXISTS is_general, DROP COLUMN IF EXISTS general_reason,
--     DROP COLUMN IF EXISTS cost_center;
--   ALTER TABLE mis_machine_allocations DROP CONSTRAINT IF EXISTS mis_machine_allocations_production_log_id_fkey;
--   DROP INDEX IF EXISTS mis_machine_allocations_production_log_id_key;
--   ALTER TABLE mis_machine_allocations DROP COLUMN IF EXISTS production_log_id, DROP COLUMN IF EXISTS source;
--   ALTER TABLE mis_leave_requests DROP CONSTRAINT IF EXISTS mis_leave_requests_end_date_ck;
--   ALTER TABLE mis_leave_requests DROP COLUMN IF EXISTS end_date, DROP COLUMN IF EXISTS leave_type;
--   ALTER TABLE mis_employees DROP COLUMN IF EXISTS bank_name, DROP COLUMN IF EXISTS bank_account_no, DROP COLUMN IF EXISTS ifsc;
--   DROP TYPE IF EXISTS mis_store_return_status;
--   DROP TYPE IF EXISTS mis_pick_list_status;
--   DROP TYPE IF EXISTS mis_doc_version_status;
--   DROP TYPE IF EXISTS mis_doc_version_type;
--   DROP TYPE IF EXISTS mis_machine_allocation_source;
--   DROP TYPE IF EXISTS mis_leave_type;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261019000000_r2_batch2_schema';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE mis_leave_type AS ENUM ('CL', 'SL', 'EL', 'LWP', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_machine_allocation_source AS ENUM ('SCHEDULED', 'PRODUCTION_LOG');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_doc_version_type AS ENUM ('COA', 'JOB_CARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_doc_version_status AS ENUM ('PREPARED', 'APPROVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_pick_list_status AS ENUM ('PENDING', 'PICKING', 'STAGED', 'HANDED_OVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mis_store_return_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. Employee bank details
-- ---------------------------------------------------------------------------
ALTER TABLE mis_employees
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no TEXT,
  ADD COLUMN IF NOT EXISTS ifsc TEXT;

-- ---------------------------------------------------------------------------
-- 2. Leave range + type
-- ---------------------------------------------------------------------------
ALTER TABLE mis_leave_requests
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS leave_type mis_leave_type NOT NULL DEFAULT 'OTHER';

DO $$ BEGIN
  ALTER TABLE mis_leave_requests
    ADD CONSTRAINT mis_leave_requests_end_date_ck CHECK (end_date IS NULL OR end_date >= date);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 3. Payslip release
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mis_payslip_releases (
  id             UUID         NOT NULL DEFAULT gen_random_uuid(),
  employee_id    UUID         NOT NULL,
  year           INTEGER      NOT NULL,
  month          INTEGER      NOT NULL,
  released_by_id UUID,
  released_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_payslip_releases_pkey PRIMARY KEY (id),
  CONSTRAINT mis_payslip_releases_month_ck CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT mis_payslip_releases_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES mis_employees(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mis_payslip_releases_employee_id_year_month_key
  ON mis_payslip_releases(employee_id, year, month);
CREATE INDEX IF NOT EXISTS mis_payslip_releases_year_month_idx ON mis_payslip_releases(year, month);

-- ---------------------------------------------------------------------------
-- 4. Document versions (COA / job card)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mis_document_versions (
  id             UUID                   NOT NULL DEFAULT gen_random_uuid(),
  doc_type       mis_doc_version_type   NOT NULL,
  ref_id         UUID                   NOT NULL,
  version        INTEGER                NOT NULL,
  status         mis_doc_version_status NOT NULL DEFAULT 'PREPARED',
  prepared_by_id UUID,
  prepared_at    TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id UUID,
  approved_at    TIMESTAMP(3),
  notes          TEXT,
  created_at     TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_document_versions_pkey PRIMARY KEY (id),
  CONSTRAINT mis_document_versions_version_ck CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS mis_document_versions_doc_type_ref_id_version_key
  ON mis_document_versions(doc_type, ref_id, version);
CREATE INDEX IF NOT EXISTS mis_document_versions_doc_type_ref_id_idx ON mis_document_versions(doc_type, ref_id);

-- ---------------------------------------------------------------------------
-- 5. Machine allocation source + production log link
-- ---------------------------------------------------------------------------
ALTER TABLE mis_machine_allocations
  ADD COLUMN IF NOT EXISTS source mis_machine_allocation_source NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS production_log_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS mis_machine_allocations_production_log_id_key
  ON mis_machine_allocations(production_log_id);

DO $$ BEGIN
  ALTER TABLE mis_machine_allocations
    ADD CONSTRAINT mis_machine_allocations_production_log_id_fkey FOREIGN KEY (production_log_id)
    REFERENCES mis_production_log(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 7. Pick list
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mis_pick_lists (
  id                  UUID                 NOT NULL DEFAULT gen_random_uuid(),
  material_request_id UUID                 NOT NULL,
  status              mis_pick_list_status NOT NULL DEFAULT 'PENDING',
  picked_by_id        UUID,
  staged_at           TIMESTAMP(3),
  handed_over_at      TIMESTAMP(3),
  handed_over_by_id   UUID,
  handed_over_to_id   UUID,
  notes               TEXT,
  created_by_id       UUID,
  created_at          TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_pick_lists_pkey PRIMARY KEY (id),
  CONSTRAINT mis_pick_lists_material_request_id_fkey FOREIGN KEY (material_request_id)
    REFERENCES mis_material_requests(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mis_pick_lists_material_request_id_key ON mis_pick_lists(material_request_id);
CREATE INDEX IF NOT EXISTS mis_pick_lists_status_idx ON mis_pick_lists(status);

CREATE TABLE IF NOT EXISTS mis_pick_list_lines (
  id                       UUID          NOT NULL DEFAULT gen_random_uuid(),
  pick_list_id             UUID          NOT NULL,
  material_request_line_id UUID,
  item_id                  UUID          NOT NULL,
  required_qty             DECIMAL(12,2) NOT NULL,
  picked_qty               DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_pick_list_lines_pkey PRIMARY KEY (id),
  CONSTRAINT mis_pick_list_lines_qty_ck CHECK (required_qty >= 0 AND picked_qty >= 0),
  CONSTRAINT mis_pick_list_lines_pick_list_id_fkey FOREIGN KEY (pick_list_id)
    REFERENCES mis_pick_lists(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT mis_pick_list_lines_material_request_line_id_fkey FOREIGN KEY (material_request_line_id)
    REFERENCES mis_material_request_lines(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT mis_pick_list_lines_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES mis_items(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS mis_pick_list_lines_pick_list_id_idx ON mis_pick_list_lines(pick_list_id);

-- ---------------------------------------------------------------------------
-- 9. General / factory use (before 8, which references mis_store_transactions only by id)
-- ---------------------------------------------------------------------------
ALTER TABLE mis_material_requests
  ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS general_reason TEXT,
  ADD COLUMN IF NOT EXISTS cost_center TEXT;
CREATE INDEX IF NOT EXISTS mis_material_requests_is_general_idx ON mis_material_requests(is_general);

ALTER TABLE mis_store_transactions
  ADD COLUMN IF NOT EXISTS is_general BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS general_reason TEXT,
  ADD COLUMN IF NOT EXISTS cost_center TEXT,
  ADD COLUMN IF NOT EXISTS material_request_id UUID;
CREATE INDEX IF NOT EXISTS mis_store_transactions_is_general_idx ON mis_store_transactions(is_general);
CREATE INDEX IF NOT EXISTS mis_store_transactions_material_request_id_idx ON mis_store_transactions(material_request_id);

DO $$ BEGIN
  ALTER TABLE mis_store_transactions
    ADD CONSTRAINT mis_store_transactions_material_request_id_fkey FOREIGN KEY (material_request_id)
    REFERENCES mis_material_requests(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 8. Store return
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mis_store_returns (
  id             UUID                    NOT NULL DEFAULT gen_random_uuid(),
  return_number  TEXT                    NOT NULL,
  item_id        UUID                    NOT NULL,
  quantity       DECIMAL(12,2)           NOT NULL,
  reason         TEXT                    NOT NULL,
  order_id       UUID,
  status         mis_store_return_status NOT NULL DEFAULT 'PENDING',
  returned_by_id UUID,
  decided_by_id  UUID,
  decided_at     TIMESTAMP(3),
  decision_note  TEXT,
  ledger_id      UUID,
  store_txn_id   UUID,
  created_at     TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_store_returns_pkey PRIMARY KEY (id),
  CONSTRAINT mis_store_returns_quantity_ck CHECK (quantity > 0),
  CONSTRAINT mis_store_returns_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES mis_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT mis_store_returns_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES mis_orders(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT mis_store_returns_ledger_id_fkey FOREIGN KEY (ledger_id)
    REFERENCES mis_inventory_ledger(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT mis_store_returns_store_txn_id_fkey FOREIGN KEY (store_txn_id)
    REFERENCES mis_store_transactions(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS mis_store_returns_return_number_key ON mis_store_returns(return_number);
CREATE INDEX IF NOT EXISTS mis_store_returns_status_idx ON mis_store_returns(status);
CREATE INDEX IF NOT EXISTS mis_store_returns_item_id_idx ON mis_store_returns(item_id);
CREATE INDEX IF NOT EXISTS mis_store_returns_order_id_idx ON mis_store_returns(order_id);

-- ---------------------------------------------------------------------------
-- 10. Master options seed (value = toOptionValue(label), src/lib/mis/master-groups.ts)
-- ---------------------------------------------------------------------------
INSERT INTO mis_master_options (id, "group", value, label, sort_order, is_active, created_at, updated_at)
  SELECT gen_random_uuid(), s.grp, s.value, s.label,
         (row_number() OVER (PARTITION BY s.grp ORDER BY s.label)) * 10, true, now(), now()
    FROM (
      SELECT DISTINCT ON (grp, value) grp, value, label
        FROM (
          SELECT g.grp, btrim(g.label) AS label,
                 btrim(regexp_replace(upper(btrim(g.label)), '[^A-Z0-9]+', '_', 'g'), '_') AS value
            FROM (
              SELECT 'GSM' AS grp, gsm AS label FROM mis_items WHERE deleted_at IS NULL
              UNION ALL SELECT 'SIZE', size FROM mis_items WHERE deleted_at IS NULL
              UNION ALL SELECT 'SUBSTRATE', substrate FROM mis_items WHERE deleted_at IS NULL
              UNION ALL SELECT 'COATING', coating FROM mis_items WHERE deleted_at IS NULL
              UNION ALL SELECT 'COST_CENTER', name FROM mis_departments WHERE deleted_at IS NULL
              UNION ALL SELECT 'COST_CENTER', 'General'
            ) g
           WHERE g.label IS NOT NULL AND btrim(g.label) <> ''
        ) n
       WHERE n.value <> ''
       ORDER BY grp, value, label
    ) s
   WHERE NOT EXISTS (SELECT 1 FROM mis_master_options o
                      WHERE o."group" = s.grp AND o.value = s.value AND o.deleted_at IS NULL);

INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '010f86e5-0b2d-4d06-af70-7b5386e9ba45', 'b9d4f55b7f97dee25b817ef4215e8149c76a9b10c94f3f93aa10907d754e101f', now(), '20261019000000_r2_batch2_schema', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261019000000_r2_batch2_schema');

COMMIT;

-- verify:
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('mis_payslip_releases','mis_document_versions','mis_pick_lists','mis_pick_list_lines','mis_store_returns');  -- expect 5 rows
-- SELECT table_name, column_name FROM information_schema.columns WHERE (table_name, column_name) IN (('mis_employees','bank_name'),('mis_employees','bank_account_no'),('mis_employees','ifsc'),('mis_leave_requests','end_date'),('mis_leave_requests','leave_type'),('mis_machine_allocations','source'),('mis_machine_allocations','production_log_id'),('mis_material_requests','is_general'),('mis_material_requests','general_reason'),('mis_material_requests','cost_center'),('mis_store_transactions','is_general'),('mis_store_transactions','general_reason'),('mis_store_transactions','cost_center'),('mis_store_transactions','material_request_id'));  -- expect 14 rows
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = '20261019000000_r2_batch2_schema';

