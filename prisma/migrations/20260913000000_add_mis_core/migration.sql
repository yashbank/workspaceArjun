-- MIS core tables.
--
-- Additive only: no existing table is altered and no existing enum is touched.
-- Every new table is prefixed mis_ and every foreign key into the live product
-- is nullable with ON DELETE SET NULL, so removing a user never cascades into
-- the factory's records.

-- CreateEnum
CREATE TYPE "MisRole" AS ENUM ('OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'WORKER');

-- CreateTable
CREATE TABLE "mis_employees" (
    "id" UUID NOT NULL,
    "user_profile_id" UUID,
    "employee_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_hi" TEXT,
    "role" "MisRole" NOT NULL DEFAULT 'WORKER',
    "manager_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mis_employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mis_user_preferences" (
    "user_profile_id" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mis_user_preferences_pkey" PRIMARY KEY ("user_profile_id")
);

-- CreateTable
CREATE TABLE "mis_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mis_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mis_master_options" (
    "id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_hi" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mis_master_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mis_employees_user_profile_id_key" ON "mis_employees"("user_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "mis_employees_employee_code_key" ON "mis_employees"("employee_code");

-- CreateIndex
CREATE INDEX "mis_employees_role_idx" ON "mis_employees"("role");

-- CreateIndex
CREATE INDEX "mis_employees_manager_id_idx" ON "mis_employees"("manager_id");

-- CreateIndex
CREATE INDEX "mis_employees_deleted_at_idx" ON "mis_employees"("deleted_at");

-- CreateIndex
CREATE INDEX "mis_audit_logs_entity_entity_id_idx" ON "mis_audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "mis_audit_logs_actor_id_idx" ON "mis_audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "mis_audit_logs_created_at_idx" ON "mis_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "mis_master_options_group_sort_order_idx" ON "mis_master_options"("group", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "mis_master_options_group_value_deleted_at_key" ON "mis_master_options"("group", "value", "deleted_at");

-- AddForeignKey
ALTER TABLE "mis_employees" ADD CONSTRAINT "mis_employees_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mis_employees" ADD CONSTRAINT "mis_employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "mis_employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mis_user_preferences" ADD CONSTRAINT "mis_user_preferences_user_profile_id_fkey" FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mis_audit_logs" ADD CONSTRAINT "mis_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
