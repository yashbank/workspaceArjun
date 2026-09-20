-- Migration: add_mis_entities
-- Phase 2: Entity masters, PO, GRN, Inventory

-- Add STORE_GUY to MisRole enum
DO $$ BEGIN
  ALTER TYPE "MisRole" ADD VALUE IF NOT EXISTS 'STORE_GUY';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Enums for PO/GRN
DO $$ BEGIN
  CREATE TYPE "mis_po_status" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','RECEIVING','PARTIAL','COMPLETE','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "mis_grn_status" AS ENUM ('DRAFT','CONFIRMED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "mis_grn_item_type" AS ENUM ('GENERAL','FOR_ORDER');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- mis_departments
CREATE TABLE IF NOT EXISTS "mis_departments" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "name_hi"     TEXT,
  "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order"  INT NOT NULL DEFAULT 0,
  "deleted_at"  TIMESTAMPTZ,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_departments_code_key" UNIQUE ("code")
);

-- mis_machines
CREATE TABLE IF NOT EXISTS "mis_machines" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"            TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "department_id"   UUID,
  "machine_type"    TEXT,
  "capacity_per_day" DECIMAL(12,2),
  "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order"      INT NOT NULL DEFAULT 0,
  "deleted_at"      TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_machines_code_key" UNIQUE ("code"),
  CONSTRAINT "mis_machines_dept_fk" FOREIGN KEY ("department_id") REFERENCES "mis_departments"("id") ON DELETE SET NULL
);

-- mis_customers
CREATE TABLE IF NOT EXISTS "mis_customers" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "name_hi"    TEXT,
  "phone"      TEXT,
  "address"    TEXT,
  "city"       TEXT,
  "gst_no"     TEXT,
  "is_active"  BOOLEAN NOT NULL DEFAULT TRUE,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_customers_code_key" UNIQUE ("code")
);

-- mis_suppliers
CREATE TABLE IF NOT EXISTS "mis_suppliers" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"                 TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "phone"                TEXT,
  "address"              TEXT,
  "city"                 TEXT,
  "gst_no"               TEXT,
  "payment_terms_days"   INT,
  "is_active"            BOOLEAN NOT NULL DEFAULT TRUE,
  "deleted_at"           TIMESTAMPTZ,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_suppliers_code_key" UNIQUE ("code")
);

-- mis_items
CREATE TABLE IF NOT EXISTS "mis_items" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "gsm"       TEXT,
  "size"      TEXT,
  "substrate" TEXT,
  "coating"   TEXT,
  "unit"      TEXT NOT NULL DEFAULT 'KG',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_items_code_key" UNIQUE ("code")
);

-- mis_processes
CREATE TABLE IF NOT EXISTS "mis_processes" (
  "id"                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"                    TEXT NOT NULL,
  "name"                    TEXT NOT NULL,
  "name_hi"                 TEXT,
  "department_id"           UUID,
  "standard_time_minutes"   INT,
  "is_active"               BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order"              INT NOT NULL DEFAULT 0,
  "deleted_at"              TIMESTAMPTZ,
  "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_processes_code_key" UNIQUE ("code"),
  CONSTRAINT "mis_processes_dept_fk" FOREIGN KEY ("department_id") REFERENCES "mis_departments"("id") ON DELETE SET NULL
);

-- mis_purchase_orders
CREATE TABLE IF NOT EXISTS "mis_purchase_orders" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "po_number"      TEXT NOT NULL,
  "supplier_id"    UUID,
  "status"         "mis_po_status" NOT NULL DEFAULT 'DRAFT',
  "bom_ref"        TEXT,
  "notes"          TEXT,
  "created_by_id"  UUID,
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_purchase_orders_po_number_key" UNIQUE ("po_number"),
  CONSTRAINT "mis_po_supplier_fk" FOREIGN KEY ("supplier_id") REFERENCES "mis_suppliers"("id") ON DELETE SET NULL
);

-- mis_po_items
CREATE TABLE IF NOT EXISTS "mis_po_items" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "po_id"             UUID NOT NULL,
  "item_id"           UUID,
  "description"       TEXT NOT NULL,
  "quantity"          DECIMAL(12,2) NOT NULL,
  "unit_id"           TEXT,
  "rate_per_unit"     DECIMAL(12,2) NOT NULL,
  "received_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "sort_order"        INT NOT NULL DEFAULT 0,
  CONSTRAINT "mis_po_items_po_fk" FOREIGN KEY ("po_id") REFERENCES "mis_purchase_orders"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_po_items_item_fk" FOREIGN KEY ("item_id") REFERENCES "mis_items"("id") ON DELETE SET NULL
);

-- mis_grns
CREATE TABLE IF NOT EXISTS "mis_grns" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "grn_number"     TEXT NOT NULL,
  "po_id"          UUID NOT NULL,
  "status"         "mis_grn_status" NOT NULL DEFAULT 'DRAFT',
  "received_at"    TIMESTAMPTZ,
  "received_by_id" UUID,
  "notes"          TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_grns_grn_number_key" UNIQUE ("grn_number"),
  CONSTRAINT "mis_grns_po_fk" FOREIGN KEY ("po_id") REFERENCES "mis_purchase_orders"("id") ON DELETE RESTRICT
);

-- mis_grn_items
CREATE TABLE IF NOT EXISTS "mis_grn_items" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "grn_id"        UUID NOT NULL,
  "po_item_id"    UUID NOT NULL,
  "received_qty"  DECIMAL(12,2) NOT NULL,
  "type"          "mis_grn_item_type" NOT NULL DEFAULT 'GENERAL',
  "for_order_ref" TEXT,
  "batch_no"      TEXT,
  "notes"         TEXT,
  CONSTRAINT "mis_grn_items_grn_fk"     FOREIGN KEY ("grn_id")     REFERENCES "mis_grns"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_grn_items_po_item_fk" FOREIGN KEY ("po_item_id") REFERENCES "mis_po_items"("id") ON DELETE RESTRICT
);

-- mis_inventory_ledger
CREATE TABLE IF NOT EXISTS "mis_inventory_ledger" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "item_id"     UUID NOT NULL,
  "change_qty"  DECIMAL(12,2) NOT NULL,
  "balance_qty" DECIMAL(12,2) NOT NULL,
  "source"      TEXT NOT NULL,
  "source_id"   TEXT,
  "notes"       TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_inventory_ledger_item_fk" FOREIGN KEY ("item_id") REFERENCES "mis_items"("id") ON DELETE RESTRICT
);

-- mis_orders
CREATE TABLE IF NOT EXISTS "mis_orders" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_number"  TEXT NOT NULL,
  "customer_id"   UUID,
  "status"        TEXT NOT NULL DEFAULT 'DRAFT',
  "description"   TEXT,
  "delivery_date" TIMESTAMPTZ,
  "notes"         TEXT,
  "created_by_id" UUID,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_orders_order_number_key" UNIQUE ("order_number"),
  CONSTRAINT "mis_orders_customer_fk" FOREIGN KEY ("customer_id") REFERENCES "mis_customers"("id") ON DELETE SET NULL
);
