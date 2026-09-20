-- Migration: mis_280_store_schema
-- MIS-280: Store module schema — item extensions + store transactions + physical counts

-- 1. Role for this module is STORE_GUY, already added to MisRole by the
--    add_mis_entities migration — no new enum value needed here.

-- 2. New enums
DO $$ BEGIN
  CREATE TYPE "MisItemCategory" AS ENUM ('RAW_MATERIAL','CONSUMABLE','EQUIPMENT','OTHER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MisItemUnit" AS ENUM ('KG','LITRE','PIECE','REAM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MisStoreTxnType" AS ENUM ('IN','OUT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Extend mis_items
ALTER TABLE "mis_items"
  ADD COLUMN IF NOT EXISTS "sku"            TEXT,
  ADD COLUMN IF NOT EXISTS "category"       "MisItemCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "price_per_unit" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "is_demo"        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "reorder_level"  DECIMAL(12,2);

-- Unique index on sku (nullable, so only non-null values are unique)
CREATE UNIQUE INDEX IF NOT EXISTS "mis_items_sku_key" ON "mis_items"("sku") WHERE "sku" IS NOT NULL;

-- Change unit from TEXT to MisItemUnit enum — only if it hasn't already
-- happened (a prior out-of-band apply may have already converted this column;
-- re-running the TEXT-specific UPDATE below against an already-enum column
-- fails, since TRIM/UPPER have no MisItemUnit overload).
DO $$ BEGIN
  IF (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mis_items' AND column_name = 'unit'
  ) = 'text' THEN
    -- Step 1: add new enum column
    EXECUTE 'ALTER TABLE "mis_items" ADD COLUMN IF NOT EXISTS "unit_new" "MisItemUnit" NOT NULL DEFAULT ''KG''';

    -- Step 2: populate from existing text values (handle known values)
    EXECUTE $sql$
      UPDATE "mis_items" SET "unit_new" =
        CASE UPPER(TRIM("unit"))
          WHEN 'KG'     THEN 'KG'::"MisItemUnit"
          WHEN 'LITRE'  THEN 'LITRE'::"MisItemUnit"
          WHEN 'PIECE'  THEN 'PIECE'::"MisItemUnit"
          WHEN 'REAM'   THEN 'REAM'::"MisItemUnit"
          ELSE 'KG'::"MisItemUnit"
        END
    $sql$;

    -- Step 3: drop old column, rename new
    EXECUTE 'ALTER TABLE "mis_items" DROP COLUMN "unit"';
    EXECUTE 'ALTER TABLE "mis_items" RENAME COLUMN "unit_new" TO "unit"';
  END IF;
END $$;

-- 4. mis_store_transactions
CREATE TABLE IF NOT EXISTS "mis_store_transactions" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "txn_number"   TEXT        NOT NULL,
  "item_id"      UUID        NOT NULL,
  "type"         "MisStoreTxnType" NOT NULL,
  "quantity"     DECIMAL(12,2) NOT NULL,
  "balance_qty"  DECIMAL(12,2) NOT NULL,
  "reference_no" TEXT,
  "reason"       TEXT,
  "is_over_issue" BOOLEAN    NOT NULL DEFAULT FALSE,
  "created_by_id" UUID,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_store_transactions_txn_number_key" UNIQUE ("txn_number"),
  CONSTRAINT "mis_store_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "mis_items"("id")
);
CREATE INDEX IF NOT EXISTS "mis_store_transactions_item_id_idx" ON "mis_store_transactions"("item_id");
CREATE INDEX IF NOT EXISTS "mis_store_transactions_created_at_idx" ON "mis_store_transactions"("created_at" DESC);

-- 5. mis_physical_counts
CREATE TABLE IF NOT EXISTS "mis_physical_counts" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "item_id"      UUID        NOT NULL,
  "count_date"   DATE        NOT NULL,
  "physical_qty" DECIMAL(12,2) NOT NULL,
  "system_qty"   DECIMAL(12,2) NOT NULL,
  "discrepancy"  DECIMAL(12,2) NOT NULL,
  "notes"        TEXT,
  "counted_by_id" UUID,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_physical_counts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "mis_items"("id")
);
CREATE INDEX IF NOT EXISTS "mis_physical_counts_item_id_idx" ON "mis_physical_counts"("item_id");
