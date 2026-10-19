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
