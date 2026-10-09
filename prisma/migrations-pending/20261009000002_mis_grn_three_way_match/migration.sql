-- NOT APPLIED. Parked in prisma/migrations-pending/ for a human to run via `pnpm db:deploy`.
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
