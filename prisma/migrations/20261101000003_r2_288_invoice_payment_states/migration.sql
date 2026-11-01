-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (`pnpm db:deploy` after moving this
-- folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-288. Additive: three enum values and nullable payment columns on mis_supplier_invoices.
--   APPROVED_FOR_PAYMENT (Owner), PAID (Admin / Owner, with payment_date + payment_ref), REJECTED (with reject_reason).
--   A paid / approved invoice keeps its state when a GRN confirm or reverse re-runs the 3-way match.
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma.
--
-- ROLLBACK (enum values cannot be dropped in PostgreSQL; drop the columns only after reverting the code):
--   ALTER TABLE mis_supplier_invoices DROP COLUMN IF EXISTS payment_approved_by_id, DROP COLUMN IF EXISTS payment_approved_at,
--     DROP COLUMN IF EXISTS paid_by_id, DROP COLUMN IF EXISTS paid_at, DROP COLUMN IF EXISTS payment_date,
--     DROP COLUMN IF EXISTS payment_ref, DROP COLUMN IF EXISTS reject_reason;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101000003_r2_288_invoice_payment_states';

ALTER TYPE mis_supplier_invoice_status ADD VALUE IF NOT EXISTS 'APPROVED_FOR_PAYMENT';
ALTER TYPE mis_supplier_invoice_status ADD VALUE IF NOT EXISTS 'PAID';
ALTER TYPE mis_supplier_invoice_status ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE mis_supplier_invoices
  ADD COLUMN IF NOT EXISTS payment_approved_by_id UUID,
  ADD COLUMN IF NOT EXISTS payment_approved_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS paid_by_id UUID,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_ref TEXT,
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;
