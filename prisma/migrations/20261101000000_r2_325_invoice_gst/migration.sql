-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (`pnpm db:deploy` after moving this
-- folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-325. Additive and idempotent: two nullable columns.
--
--   1. mis_grns.supplier_invoice_gst_percent NUMERIC(5,2) NULL — the GST % typed on the delivery paperwork.
--   2. mis_supplier_invoices.gst_percent     NUMERIC(5,2) NULL — carried onto the invoice when the GRN confirms.
--      The 3-way match compares the invoice amount EXCLUDING this GST with (challan qty x PO rate).
--      NULL = no GST entered: the match behaves exactly as before.
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma (Prisma selects every
-- scalar column by default; a deploy before this column exists 500s the GRN and invoice screens).
--
-- ROLLBACK (only if you must undo; code that selects these columns must be reverted first):
--   ALTER TABLE mis_grns DROP COLUMN IF EXISTS supplier_invoice_gst_percent;
--   ALTER TABLE mis_supplier_invoices DROP COLUMN IF EXISTS gst_percent;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101000000_r2_325_invoice_gst';

ALTER TABLE mis_grns ADD COLUMN IF NOT EXISTS supplier_invoice_gst_percent NUMERIC(5,2);
ALTER TABLE mis_supplier_invoices ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(5,2);
