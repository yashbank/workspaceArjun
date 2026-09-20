-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/CHANGE_PO_WITHOUT_BOM.md for when to promote it.
--
-- Optional hardening for the "PO without a BOM" change (Arjun, Sep 2026).
-- The change itself needed NO schema work: mis_purchase_orders.bom_ref is
-- already nullable with no foreign key, so a buffer-stock PO stores and reads
-- back fine today, and purpose is derived from it in src/lib/mis/po-purpose.ts.
--
-- Promote to a stored column only when SQL itself has to filter or group on
-- purpose — purpose-aware approval limits, or a report that buckets POs by
-- order and needs "Buffer stock" as a first-class group rather than a NULL.
--
-- Enum name and @@map style follow mis_grn_item_type / mis_po_status.

CREATE TYPE mis_po_purpose AS ENUM ('FOR_ORDER', 'BUFFER_STOCK');

ALTER TABLE mis_purchase_orders
  ADD COLUMN purpose mis_po_purpose NOT NULL DEFAULT 'FOR_ORDER';

-- Backfill from the signal that already exists. Every historical PO with no
-- BOM reference was, in fact, bought for stock.
UPDATE mis_purchase_orders
   SET purpose = 'BUFFER_STOCK'
 WHERE bom_ref IS NULL;

-- Keep the two in step from here on: a BOM PO carries its reference, a
-- buffer-stock PO carries none.
ALTER TABLE mis_purchase_orders
  ADD CONSTRAINT mis_purchase_orders_purpose_bom_ref_ck
  CHECK (
    (purpose = 'FOR_ORDER'    AND bom_ref IS NOT NULL) OR
    (purpose = 'BUFFER_STOCK' AND bom_ref IS NULL)
  );

CREATE INDEX mis_purchase_orders_purpose_idx ON mis_purchase_orders (purpose);

-- Prisma side (schema.prisma), to be added in the same commit:
--
--   enum MisPoPurpose {
--     FOR_ORDER
--     BUFFER_STOCK
--     @@map("mis_po_purpose")
--   }
--
--   model MisPurchaseOrder {
--     ...
--     purpose MisPoPurpose @default(FOR_ORDER)
--     ...
--     @@index([purpose])
--   }
--
-- Then `pnpm db:generate`. NOTE: `prisma generate` cannot run from the Cowork
-- shell (engine download is 403-blocked), so this must be done on a machine
-- with network access to binaries.prisma.sh before any code references
-- `MisPoPurpose` — tsc will not compile against a client that lacks it.
--
-- Rollback:
--   ALTER TABLE mis_purchase_orders DROP CONSTRAINT mis_purchase_orders_purpose_bom_ref_ck;
--   DROP INDEX mis_purchase_orders_purpose_idx;
--   ALTER TABLE mis_purchase_orders DROP COLUMN purpose;
--   DROP TYPE mis_po_purpose;
