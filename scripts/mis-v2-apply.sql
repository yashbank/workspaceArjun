-- MIS V2 — apply all five migrations in one go via the Supabase SQL editor.
-- Use ONLY if `pnpm db:deploy` cannot connect. Each block is additive and idempotent.
-- The final INSERTs record them in _prisma_migrations with Prisma's own checksums, so a later
-- `pnpm db:deploy` sees them as applied and does not re-run them.

BEGIN;

-- ===== 20261009000000_mis_material_requests =====
-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 3 — categorised Material Issue Notes. Additive only: two new tables, one enum.

DO $$ BEGIN CREATE TYPE mis_material_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mis_material_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number   TEXT NOT NULL UNIQUE,
  status           mis_material_request_status NOT NULL DEFAULT 'PENDING',
  order_id         UUID REFERENCES mis_orders(id),
  department_id    UUID REFERENCES mis_departments(id),
  notes            TEXT,
  requested_by_id  UUID,
  decided_by_id    UUID,
  decided_at       TIMESTAMP(3),
  decision_note    TEXT,
  created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS mis_material_requests_status_idx ON mis_material_requests(status);

CREATE TABLE IF NOT EXISTS mis_material_request_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID NOT NULL REFERENCES mis_material_requests(id),
  item_id            UUID NOT NULL REFERENCES mis_items(id),
  requested_qty      DECIMAL(12,2) NOT NULL,
  actual_issued_qty  DECIMAL(12,2)
);
CREATE INDEX IF NOT EXISTS mis_material_request_lines_request_id_idx ON mis_material_request_lines(request_id);


-- ===== 20261009000001_mis_order_stock_allocations =====
-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 2 — order-wise stock allocation. Additive only: one new table.

CREATE TABLE IF NOT EXISTS mis_order_stock_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES mis_orders(id),
  item_id        UUID NOT NULL REFERENCES mis_items(id),
  allocated_qty  DECIMAL(12,2) NOT NULL,
  source         TEXT NOT NULL,
  source_id      TEXT,
  created_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mis_order_stock_allocations_order_id_item_id_idx ON mis_order_stock_allocations(order_id, item_id);


-- ===== 20261009000002_mis_grn_three_way_match =====
-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 1 — GRN paperwork fields, DC/damage/short per line, supplier invoices. Additive only.

ALTER TABLE mis_grns
  ADD COLUMN IF NOT EXISTS supplier_invoice_no TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS supplier_invoice_amount DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS lr_number TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS transporter_name TEXT,
  ADD COLUMN IF NOT EXISTS dc_number TEXT;

ALTER TABLE mis_grn_items
  ADD COLUMN IF NOT EXISTS dc_quantity DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS damage_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS short_quantity DECIMAL(12,2);

CREATE TABLE IF NOT EXISTS mis_supplier_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES mis_purchase_orders(id),
  grn_id          UUID REFERENCES mis_grns(id),
  supplier_id     UUID REFERENCES mis_suppliers(id),
  invoice_no      TEXT NOT NULL,
  invoice_date    DATE,
  invoice_amount  DECIMAL(14,2),
  notes           TEXT,
  created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP(3) NOT NULL,
  CONSTRAINT mis_supplier_invoices_po_id_invoice_no_key UNIQUE (po_id, invoice_no)
);


-- ===== 20261009000003_mis_qc_templates =====
-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 5 — QC checklist templates (paper → digital). Additive only, plus the four seeded forms
-- (same list as lib/mis/qc-template.ts DEFAULT_QC_TEMPLATES; re-running is a no-op).

CREATE TABLE IF NOT EXISTS mis_qc_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  process_name  TEXT,
  slot_start    TEXT NOT NULL DEFAULT '09:15',
  slot_end      TEXT NOT NULL DEFAULT '18:00',
  parameters    JSONB NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  deleted_at    TIMESTAMP(3),
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE mis_qc_checks
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES mis_qc_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slot_time TEXT;

INSERT INTO mis_qc_templates (name, process_name, parameters, sort_order) VALUES
  ('Printing 6-Colours', 'Printing', '["Colour shade vs approved sample", "Registration", "Ink density", "Set-off / smudging", "Scumming / hickeys", "Sheet count"]'::jsonb, 0),
  ('Lamination', 'Lamination', '["Film type & GSM", "Bond strength (peel)", "Bubbles / wrinkles", "Trim alignment", "Curl"]'::jsonb, 1),
  ('Lamif Flute', 'Fluting', '["Flute profile", "Glue bond", "Warp", "Board thickness", "Surface damage"]'::jsonb, 2),
  ('Die Cutting', 'Die Cutting', '["Die position / registration", "Creasing depth", "Cut cleanliness (no burr)", "Stripping", "Sheet count"]'::jsonb, 3)
ON CONFLICT (name) DO NOTHING;


-- ===== 20261009000004_mis_employee_photo =====
-- Applied via `pnpm db:deploy` (moved from migrations-pending, 2026-10-09).
-- V2 Epic 7 — employee photo for kiosk verification. Additive only.

ALTER TABLE mis_employees ADD COLUMN IF NOT EXISTS photo_url TEXT;


-- ===== ledger =====
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '64e03615-1aaf-4058-99bd-765459fa658a', 'd7ce1966c9e60bb2c7d5bbccecd4dd0e99c4c90de4343e8add9592230c558ff6', now(), '20261009000000_mis_material_requests', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261009000000_mis_material_requests');
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '8384bd08-77a3-4436-8eef-1e5f0a028180', '49336405f59a2d0a2614274143106b47ab97db8ce7db8e0a8dc76187bdf9d0f8', now(), '20261009000001_mis_order_stock_allocations', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261009000001_mis_order_stock_allocations');
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '35c15a8e-df12-44ee-974d-09e27c70c2bc', 'defe4db9ae95474c33d9678cd5c653af94ea925a2753ab7316349f4b67ba676f', now(), '20261009000002_mis_grn_three_way_match', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261009000002_mis_grn_three_way_match');
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '57693c71-7974-49c9-aabb-00c818ad0435', '0da41cb05cf7e07dac258b7f0183faf5cc720e7e59725fc04c27df068651383a', now(), '20261009000003_mis_qc_templates', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261009000003_mis_qc_templates');
INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  SELECT '8e833646-eb86-4202-ac07-2c0b86b7d7b7', '3ebe16b9b55fa301e5f0d9a0990b9cc1b9c0b44e64f116aebd153c2f6f022b02', now(), '20261009000004_mis_employee_photo', NULL, NULL, now(), 1
  WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261009000004_mis_employee_photo');

COMMIT;

-- verify:
-- SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name LIKE '20261009%';