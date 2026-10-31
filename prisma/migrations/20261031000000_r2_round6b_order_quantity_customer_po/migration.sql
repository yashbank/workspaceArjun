-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, or
-- `pnpm db:deploy` after moving this folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-264 / R2-265 (round 6B). Additive and idempotent: three nullable columns on mis_orders.
--
--   1. quantity        numeric(12,2)  finished-goods target (mandatory for NEW orders in code; old rows stay NULL)
--   2. unit            text           PIECE | KG | REAM (lib/mis/order-quantity.ts)
--   3. customer_po_ref text           the customer's own PO number, optional, searchable, printed on the job card
--
-- ORDER OF OPERATIONS: apply this BEFORE deploying code that reads the columns. Until it is applied the deployed
-- (older) code ignores them; nothing else is affected. Safe to run while the current code is live.
--
-- ROLLBACK:
--   ALTER TABLE mis_orders DROP COLUMN IF EXISTS customer_po_ref;
--   ALTER TABLE mis_orders DROP COLUMN IF EXISTS unit;
--   ALTER TABLE mis_orders DROP COLUMN IF EXISTS quantity;

ALTER TABLE mis_orders ADD COLUMN IF NOT EXISTS quantity numeric(12,2);
ALTER TABLE mis_orders ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE mis_orders ADD COLUMN IF NOT EXISTS customer_po_ref text;
