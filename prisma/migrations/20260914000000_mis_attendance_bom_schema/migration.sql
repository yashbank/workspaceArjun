-- Migration: mis_attendance_bom_schema
-- Adds the models attendance.ts and bom.ts were already written against.
--
-- NOTE: by the time this migration file was corrected, mis_shifts,
-- mis_attendance, mis_leave_requests, mis_bom, mis_bom_stages,
-- mis_bom_materials, mis_documents, mis_production_log, mis_qc_checks,
-- mis_machine_allocations and mis_business_rules already existed in the
-- target database (created out-of-band, outside Prisma's migration
-- history — most likely an earlier `prisma db push`). Every CREATE TABLE
-- below is IF NOT EXISTS and will no-op there. This file exists so a FRESH
-- database (a new environment, CI, a teammate's machine) ends up with the
-- exact same schema. Column list matches the live database, not the
-- original (incorrect) draft of this migration:
--   - table name is "mis_bom", not "mis_boms"
--   - mis_leave_requests has no separate requested_at column (uses created_at)
--   - mis_attendance has updated_at

-- 1. mis_employees.department_id — the one genuinely-missing piece
ALTER TABLE "mis_employees"
  ADD COLUMN IF NOT EXISTS "department_id" UUID;

DO $$ BEGIN
  ALTER TABLE "mis_employees"
    ADD CONSTRAINT "mis_employees_department_fk"
    FOREIGN KEY ("department_id") REFERENCES "mis_departments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "mis_employees_department_id_idx" ON "mis_employees"("department_id");

-- 2. mis_shifts
CREATE TABLE IF NOT EXISTS "mis_shifts" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name"        TEXT        NOT NULL,
  "start_time"  TEXT        NOT NULL,
  "end_time"    TEXT        NOT NULL,
  "is_default"  BOOLEAN     NOT NULL DEFAULT FALSE,
  "is_active"   BOOLEAN     NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. mis_attendance
CREATE TABLE IF NOT EXISTS "mis_attendance" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_id"    UUID        NOT NULL,
  "date"           DATE        NOT NULL,
  "shift_id"       UUID,
  "status"         TEXT        NOT NULL DEFAULT 'PRESENT',
  "clock_in"       TIMESTAMPTZ,
  "clock_out"      TIMESTAMPTZ,
  "approved_out"   BOOLEAN     NOT NULL DEFAULT FALSE,
  "approved_by_id" UUID,
  "ot_minutes"     INT         NOT NULL DEFAULT 0,
  "late_minutes"   INT         NOT NULL DEFAULT 0,
  "notes"          TEXT,
  "edited_at"      TIMESTAMPTZ,
  "edited_by_id"   UUID,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_attendance_employee_date_key" UNIQUE ("employee_id", "date"),
  CONSTRAINT "mis_attendance_emp_fk" FOREIGN KEY ("employee_id") REFERENCES "mis_employees"("id") ON DELETE RESTRICT,
  CONSTRAINT "mis_attendance_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "mis_shifts"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "mis_attendance_date_idx" ON "mis_attendance"("date");

-- 4. mis_leave_requests
CREATE TABLE IF NOT EXISTS "mis_leave_requests" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_id"    UUID        NOT NULL,
  "date"           DATE        NOT NULL,
  "reason"         TEXT,
  "status"         TEXT        NOT NULL DEFAULT 'PENDING',
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_leave_emp_fk" FOREIGN KEY ("employee_id") REFERENCES "mis_employees"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "mis_leave_requests_status_idx" ON "mis_leave_requests"("status");

-- 5. mis_bom
CREATE TABLE IF NOT EXISTS "mis_bom" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_id"       UUID        NOT NULL,
  "status"         TEXT        NOT NULL DEFAULT 'DRAFT',
  "notes"          TEXT,
  "created_by_id"  UUID,
  "approved_by_id" UUID,
  "approved_at"    TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_bom_order_id_key" UNIQUE ("order_id"),
  CONSTRAINT "mis_bom_order_fk" FOREIGN KEY ("order_id") REFERENCES "mis_orders"("id") ON DELETE RESTRICT
);

-- 6. mis_bom_stages
CREATE TABLE IF NOT EXISTS "mis_bom_stages" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "bom_id"      UUID NOT NULL,
  "stage_name"  TEXT NOT NULL,
  "process_id"  UUID,
  "seq"         INT  NOT NULL DEFAULT 0,
  "notes"       TEXT,
  CONSTRAINT "mis_bom_stage_bom_fk" FOREIGN KEY ("bom_id") REFERENCES "mis_bom"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_bom_stage_process_fk" FOREIGN KEY ("process_id") REFERENCES "mis_processes"("id")
);

-- 7. mis_bom_materials
CREATE TABLE IF NOT EXISTS "mis_bom_materials" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "stage_id"      UUID NOT NULL,
  "description"   TEXT NOT NULL,
  "item_id"       UUID,
  "quantity"      DECIMAL(12,2) NOT NULL,
  "unit"          TEXT NOT NULL DEFAULT 'KG',
  "rate_per_unit" DECIMAL(12,2),
  "seq"           INT NOT NULL DEFAULT 0,
  CONSTRAINT "mis_bom_mat_stage_fk" FOREIGN KEY ("stage_id") REFERENCES "mis_bom_stages"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_bom_mat_item_fk" FOREIGN KEY ("item_id") REFERENCES "mis_items"("id") ON DELETE SET NULL
);

-- 8. mis_documents — uploaded_by references Supabase's auth.users directly
--    (raw FK, not modeled as a Prisma relation, same as createdById elsewhere)
CREATE TABLE IF NOT EXISTS "mis_documents" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_id"    UUID        NOT NULL,
  "name"        TEXT        NOT NULL,
  "description" TEXT,
  "file_path"   TEXT        NOT NULL,
  "file_size"   INT,
  "mime_type"   TEXT,
  "uploaded_by" UUID,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_documents_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "mis_orders"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mis_documents_order_id_idx" ON "mis_documents"("order_id");

DO $$ BEGIN
  ALTER TABLE "mis_documents"
    ADD CONSTRAINT "mis_documents_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 9. mis_production_log
CREATE TABLE IF NOT EXISTS "mis_production_log" (
  "id"           UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_id"     UUID          NOT NULL,
  "bom_stage_id" UUID,
  "machine_id"   UUID,
  "employee_id"  UUID,
  "shift_id"     UUID,
  "qty_produced" DECIMAL       NOT NULL,
  "qty_waste"    DECIMAL       NOT NULL DEFAULT 0,
  "unit"         TEXT          NOT NULL DEFAULT 'KG',
  "logged_by_id" UUID,
  "logged_at"    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "notes"        TEXT,
  CONSTRAINT "mis_prod_order_fk" FOREIGN KEY ("order_id") REFERENCES "mis_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "mis_prod_stage_fk" FOREIGN KEY ("bom_stage_id") REFERENCES "mis_bom_stages"("id") ON DELETE SET NULL,
  CONSTRAINT "mis_prod_machine_fk" FOREIGN KEY ("machine_id") REFERENCES "mis_machines"("id") ON DELETE SET NULL,
  CONSTRAINT "mis_prod_emp_fk" FOREIGN KEY ("employee_id") REFERENCES "mis_employees"("id") ON DELETE SET NULL,
  CONSTRAINT "mis_prod_shift_fk" FOREIGN KEY ("shift_id") REFERENCES "mis_shifts"("id") ON DELETE SET NULL
);

-- 10. mis_qc_checks
CREATE TABLE IF NOT EXISTS "mis_qc_checks" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "order_id"       UUID        NOT NULL,
  "bom_stage_id"   UUID,
  "check_time"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "check_by_id"    UUID,
  "result"         TEXT        NOT NULL DEFAULT 'PASS',
  "defect_type"    TEXT,
  "defect_qty"     DECIMAL,
  "notes"          TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "parameter_name" TEXT        DEFAULT 'General',
  CONSTRAINT "mis_qc_order_fk" FOREIGN KEY ("order_id") REFERENCES "mis_orders"("id") ON DELETE RESTRICT,
  CONSTRAINT "mis_qc_stage_fk" FOREIGN KEY ("bom_stage_id") REFERENCES "mis_bom_stages"("id") ON DELETE SET NULL
);

-- 11. mis_machine_allocations
CREATE TABLE IF NOT EXISTS "mis_machine_allocations" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "machine_id"      UUID        NOT NULL,
  "order_id"        UUID,
  "job_ref"         TEXT,
  "allocated_by_id" UUID,
  "starts_at"       TIMESTAMPTZ NOT NULL,
  "ends_at"         TIMESTAMPTZ NOT NULL,
  "released_at"     TIMESTAMPTZ,
  "notes"           TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_alloc_machine_fk" FOREIGN KEY ("machine_id") REFERENCES "mis_machines"("id") ON DELETE RESTRICT,
  CONSTRAINT "mis_alloc_order_fk" FOREIGN KEY ("order_id") REFERENCES "mis_orders"("id") ON DELETE SET NULL
);

-- 12. mis_business_rules — multiple rows per rule_key, one per effective_from
CREATE TABLE IF NOT EXISTS "mis_business_rules" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "rule_key"       TEXT        NOT NULL,
  "rule_value"     TEXT        NOT NULL,
  "value_type"     TEXT        NOT NULL DEFAULT 'string',
  "label"          TEXT        NOT NULL,
  "description"    TEXT,
  "effective_from" DATE        NOT NULL DEFAULT CURRENT_DATE,
  "updated_by_id"  UUID,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_rules_key_date_key" UNIQUE ("rule_key", "effective_from")
);
