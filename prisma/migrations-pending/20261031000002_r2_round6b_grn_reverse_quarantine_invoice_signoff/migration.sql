-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-277 / R2-278 / R2-280 (round 6B). Additive and idempotent.
--
--   1. mis_grn_status gains REVERSED (R2-277). The row is kept; stock is credited back out in the ledger.
--      NOTE: ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement using the value. Run this
--      file on its own (the other statements here do not use the new value).
--   2. mis_grns gains reversed_by_id / reversed_at / reverse_reason (R2-277), all nullable.
--   3. mis_quarantine_stock (R2-278): damaged quantity on a confirmed GRN line, HELD until the Owner marks it RETURNED.
--   4. mis_supplier_invoices gains the Owner's variance sign-off columns (R2-280), all nullable.
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code that writes these. Until then, the older deployed code is unaffected.
--
-- ROLLBACK (Postgres cannot drop an enum value; leave REVERSED in place):
--   ALTER TABLE mis_supplier_invoices DROP COLUMN IF EXISTS variance_sign_off_note, DROP COLUMN IF EXISTS variance_signed_off_at, DROP COLUMN IF EXISTS variance_signed_off_by_id;
--   DROP TABLE IF EXISTS mis_quarantine_stock; DROP TYPE IF EXISTS mis_quarantine_status;
--   ALTER TABLE mis_grns DROP COLUMN IF EXISTS reverse_reason, DROP COLUMN IF EXISTS reversed_at, DROP COLUMN IF EXISTS reversed_by_id;

ALTER TYPE mis_grn_status ADD VALUE IF NOT EXISTS 'REVERSED';

ALTER TABLE mis_grns ADD COLUMN IF NOT EXISTS reversed_by_id uuid;
ALTER TABLE mis_grns ADD COLUMN IF NOT EXISTS reversed_at timestamp(3);
ALTER TABLE mis_grns ADD COLUMN IF NOT EXISTS reverse_reason text;

DO $$ BEGIN
  CREATE TYPE mis_quarantine_status AS ENUM ('HELD', 'RETURNED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS mis_quarantine_stock (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id          uuid NOT NULL REFERENCES mis_grns(id),
  grn_item_id     uuid,
  item_id         uuid NOT NULL REFERENCES mis_items(id),
  supplier_id     uuid,
  quantity        numeric(12,2) NOT NULL,
  status          mis_quarantine_status NOT NULL DEFAULT 'HELD',
  returned_by_id  uuid,
  returned_at     timestamp(3),
  return_note     text,
  created_at      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mis_quarantine_stock_grn_id_idx ON mis_quarantine_stock(grn_id);
CREATE INDEX IF NOT EXISTS mis_quarantine_stock_status_idx ON mis_quarantine_stock(status);

ALTER TABLE mis_supplier_invoices ADD COLUMN IF NOT EXISTS variance_signed_off_by_id uuid;
ALTER TABLE mis_supplier_invoices ADD COLUMN IF NOT EXISTS variance_signed_off_at timestamp(3);
ALTER TABLE mis_supplier_invoices ADD COLUMN IF NOT EXISTS variance_sign_off_note text;
