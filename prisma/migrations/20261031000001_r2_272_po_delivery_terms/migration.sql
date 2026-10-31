-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-272 (round 6B). Additive and idempotent: two nullable columns on mis_purchase_orders.
--
--   1. delivery_due_date date   promised delivery date (mandatory for NEW POs in code; old rows stay NULL)
--   2. payment_terms     text   one of lib/mis/po-terms.ts PAYMENT_TERMS (ADVANCE_100, ADVANCE_50, ON_DELIVERY, NET_15, NET_30, NET_45, NET_60)
--
-- ORDER OF OPERATIONS: apply this BEFORE deploying code that reads the columns. The deployed (older) code ignores them.
--
-- ROLLBACK:
--   ALTER TABLE mis_purchase_orders DROP COLUMN IF EXISTS payment_terms;
--   ALTER TABLE mis_purchase_orders DROP COLUMN IF EXISTS delivery_due_date;

ALTER TABLE mis_purchase_orders ADD COLUMN IF NOT EXISTS delivery_due_date date;
ALTER TABLE mis_purchase_orders ADD COLUMN IF NOT EXISTS payment_terms text;
