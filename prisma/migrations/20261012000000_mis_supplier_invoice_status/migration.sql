-- Applied via `pnpm db:deploy`. Folder promoted from prisma/migrations-pending/ into
-- prisma/migrations/ on 2026-10-26 to fix repo/DB drift (this migration was already
-- live on production; the folder had just never been moved here).
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
