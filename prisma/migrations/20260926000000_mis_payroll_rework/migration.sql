-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 25 for when to
-- promote it (after the human runs `pnpm db:deploy && pnpm db:generate`).
--
-- Phase 25 · payroll rules from Arjun's review (MIS-216 family; no other ticket).
-- SCHEMA GATE Half A only — this file and the schema.prisma edit in the same
-- commit. No TypeScript references any of this yet; that is Half B, a new
-- session, after `pnpm db:generate`.
--
-- Implements 25.1 (per-employee payslip component toggles), 25.2 (an OT rate
-- per hour on the wage code, D26), 25.3 (pay type + Sunday pay on the
-- employee), 25.4 (extra-pay days, D28), 25.5 (multiplier basis on the wage
-- code, D28), and D27's still-missing half: a payroll-period snapshot so a
-- closed month stays closed even when a rate is later back-dated into it.
-- New policy choices this design makes are recorded as D33 in DECISIONS.md
-- (component toggles are not effective-dated — the snapshot protects closed
-- months instead; the employee→wage-code link is a CODE, like every other
-- reference to mis_wage_types, not a foreign key; "Salary" vs "Basic Wage" is
-- a display label switch on pay_type, not a stored value).
--
-- MONEY (D24): mis_payroll_snapshot_lines and every new amount column on
-- mis_wage_types/mis_extra_pay_days are wages. Half B must gate every reader
-- on wages.read and must NEVER write a snapshot-line value, an extra-pay
-- value, an OT rate or a component amount into a MisAuditLog before/after
-- payload — extend the redaction list in the same helper 24D already used
-- for material/stock prices (lib/mis/money-fields.ts is the read-side
-- equivalent; the audit redaction list lives in server/mis/audit.ts).

-- ── mis_employees: wage-code link (soft, by code — see the schema comment),
--    pay type, Sunday pay (25.2, 25.3) ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "mis_pay_type" AS ENUM ('MONTHLY','DAILY');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "mis_employees"
  ADD COLUMN IF NOT EXISTS "wage_type_code" TEXT,
  ADD COLUMN IF NOT EXISTS "pay_type"       "mis_pay_type" NOT NULL DEFAULT 'DAILY',
  ADD COLUMN IF NOT EXISTS "sunday_paid"    BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "mis_employees_wage_type_code_idx" ON "mis_employees" ("wage_type_code");

-- ── mis_wage_types: OT rate/hour (D26), multiplier basis (D28), the three
--    component base amounts the payslip can print (25.1) ───────────────────

DO $$ BEGIN
  CREATE TYPE "mis_pay_basis" AS ENUM ('PER_MONTH','PER_HOUR');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "mis_wage_types"
  ADD COLUMN IF NOT EXISTS "ot_rate_per_hour"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "multiplier_basis"  "mis_pay_basis" NOT NULL DEFAULT 'PER_MONTH',
  ADD COLUMN IF NOT EXISTS "hra_amount"        DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "allowance_amount"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "bonus_amount"      DECIMAL(12,2);

-- ── mis_employee_pay_components: per-employee on/off switch, one row per
--    (employee, component) — 25.1 ───────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "mis_pay_component" AS ENUM ('BASIC','HRA','ALLOWANCE','OT','BONUS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "mis_employee_pay_components" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "employee_id"    UUID        NOT NULL REFERENCES "mis_employees"("id") ON DELETE CASCADE,
  "component"      "mis_pay_component" NOT NULL,
  "enabled"        BOOLEAN     NOT NULL DEFAULT TRUE,
  "updated_by_id"  UUID,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_employee_pay_components_employee_component_key" UNIQUE ("employee_id", "component")
);

-- ── mis_extra_pay_days + its two scope tables — 25.4, D28 ───────────────────

DO $$ BEGIN
  CREATE TYPE "mis_extra_pay_kind" AS ENUM ('MULTIPLIER','FLAT_AMOUNT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "mis_extra_pay_scope" AS ENUM ('ALL_PRESENT','EMPLOYEES','DEPARTMENTS');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "mis_extra_pay_status" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "mis_extra_pay_days" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "date"            DATE        NOT NULL,
  "kind"            "mis_extra_pay_kind" NOT NULL,
  "value"           DECIMAL(12,2) NOT NULL,
  "scope"           "mis_extra_pay_scope" NOT NULL,
  "reason"          TEXT        NOT NULL,
  "status"          "mis_extra_pay_status" NOT NULL DEFAULT 'PENDING',
  "proposed_by_id"  UUID        NOT NULL,
  "approved_by_id"  UUID,
  "approved_at"     TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "mis_extra_pay_days_date_idx"   ON "mis_extra_pay_days" ("date");
CREATE INDEX IF NOT EXISTS "mis_extra_pay_days_status_idx" ON "mis_extra_pay_days" ("status");

CREATE TABLE IF NOT EXISTS "mis_extra_pay_day_employees" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "extra_pay_day_id"  UUID NOT NULL REFERENCES "mis_extra_pay_days"("id") ON DELETE CASCADE,
  "employee_id"       UUID NOT NULL REFERENCES "mis_employees"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_extra_pay_day_employees_day_employee_key" UNIQUE ("extra_pay_day_id", "employee_id")
);

CREATE TABLE IF NOT EXISTS "mis_extra_pay_day_departments" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "extra_pay_day_id"  UUID NOT NULL REFERENCES "mis_extra_pay_days"("id") ON DELETE CASCADE,
  "department_id"     UUID NOT NULL REFERENCES "mis_departments"("id") ON DELETE CASCADE,
  CONSTRAINT "mis_extra_pay_day_departments_day_department_key" UNIQUE ("extra_pay_day_id", "department_id")
);

-- ── mis_payroll_periods + mis_payroll_snapshot_lines — D27's missing half,
--    W9's "Closed" / "Corrections after close: 0" / "Export August" ────────

DO $$ BEGIN
  CREATE TYPE "mis_payroll_period_status" AS ENUM ('OPEN','CLOSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "mis_payroll_periods" (
  "id"                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "year"                     INTEGER     NOT NULL,
  "month"                    INTEGER     NOT NULL,
  "status"                   "mis_payroll_period_status" NOT NULL DEFAULT 'OPEN',
  "closed_by_id"             UUID,
  "closed_at"                TIMESTAMPTZ,
  "corrections_after_close"  INTEGER     NOT NULL DEFAULT 0,
  "last_exported_by_id"      UUID,
  "last_exported_at"         TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_payroll_periods_year_month_key" UNIQUE ("year", "month")
);

CREATE TABLE IF NOT EXISTS "mis_payroll_snapshot_lines" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "period_id"      UUID        NOT NULL REFERENCES "mis_payroll_periods"("id") ON DELETE CASCADE,
  -- Denormalised on purpose — a later employee edit/rename/role change must
  -- never alter a closed month's own record of what it paid.
  "employee_id"    UUID        NOT NULL,
  "employee_code"  TEXT        NOT NULL,
  "employee_name"  TEXT        NOT NULL,
  "pay_type"       "mis_pay_type" NOT NULL,

  "working_days"   INTEGER     NOT NULL,
  "present"        INTEGER     NOT NULL,
  "half_day"       INTEGER     NOT NULL,
  "absent"         INTEGER     NOT NULL,
  "leave"          INTEGER     NOT NULL,
  "ot_minutes"     INTEGER     NOT NULL,
  "late_minutes"   INTEGER     NOT NULL,
  "allowance_days" INTEGER     NOT NULL DEFAULT 0,

  "basic_wage"     DECIMAL(12,2) NOT NULL,
  "hra"            DECIMAL(12,2) NOT NULL DEFAULT 0,
  "allowance"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "ot_pay"         DECIMAL(12,2) NOT NULL,
  "bonus"          DECIMAL(12,2) NOT NULL DEFAULT 0,
  "extra_pay"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "late_penalty"   DECIMAL(12,2) NOT NULL,
  "gross_pay"      DECIMAL(12,2) NOT NULL,

  "wage_type_code" TEXT,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_payroll_snapshot_lines_period_employee_key" UNIQUE ("period_id", "employee_id")
);

CREATE INDEX IF NOT EXISTS "mis_payroll_snapshot_lines_employee_id_idx" ON "mis_payroll_snapshot_lines" ("employee_id");

-- Prisma side (schema.prisma), added in the same commit:
--
--   model MisEmployee { ... wageTypeCode String? payType MisPayType @default(DAILY)
--     sundayPaid Boolean @default(false) payComponents MisEmployeePayComponent[] ... }
--   model MisWageType { ... otRatePerHour Decimal? multiplierBasis MisPayBasis
--     @default(PER_MONTH) hraAmount Decimal? allowanceAmount Decimal? bonusAmount Decimal? ... }
--   enum MisPayType { MONTHLY DAILY @@map("mis_pay_type") }
--   enum MisPayBasis { PER_MONTH PER_HOUR @@map("mis_pay_basis") }
--   enum MisPayComponent { BASIC HRA ALLOWANCE OT BONUS @@map("mis_pay_component") }
--   model MisEmployeePayComponent { ... @@unique([employeeId, component])
--     @@map("mis_employee_pay_components") }
--   enum MisExtraPayKind { MULTIPLIER FLAT_AMOUNT @@map("mis_extra_pay_kind") }
--   enum MisExtraPayScope { ALL_PRESENT EMPLOYEES DEPARTMENTS @@map("mis_extra_pay_scope") }
--   enum MisExtraPayStatus { PENDING APPROVED REJECTED @@map("mis_extra_pay_status") }
--   model MisExtraPayDay { ... employees MisExtraPayDayEmployee[]
--     departments MisExtraPayDayDepartment[] @@map("mis_extra_pay_days") }
--   model MisExtraPayDayEmployee { ... @@map("mis_extra_pay_day_employees") }
--   model MisExtraPayDayDepartment { ... @@map("mis_extra_pay_day_departments") }
--   enum MisPayrollPeriodStatus { OPEN CLOSED @@map("mis_payroll_period_status") }
--   model MisPayrollPeriod { ... lines MisPayrollSnapshotLine[]
--     @@unique([year, month]) @@map("mis_payroll_periods") }
--   model MisPayrollSnapshotLine { ... period MisPayrollPeriod @relation(...)
--     @@unique([periodId, employeeId]) @@map("mis_payroll_snapshot_lines") }
--
-- Then `pnpm db:generate`. `prisma generate`/`migrate` cannot run from the
-- agent shell (engine download is 403-blocked), so this must be run on the
-- Mac before any code references any of the above — tsc will not compile
-- against a client that lacks them.
--
-- Rollback:
--   DROP TABLE IF EXISTS mis_payroll_snapshot_lines;
--   DROP TABLE IF EXISTS mis_payroll_periods;
--   DROP TABLE IF EXISTS mis_extra_pay_day_departments;
--   DROP TABLE IF EXISTS mis_extra_pay_day_employees;
--   DROP TABLE IF EXISTS mis_extra_pay_days;
--   DROP TABLE IF EXISTS mis_employee_pay_components;
--   ALTER TABLE mis_wage_types
--     DROP COLUMN IF EXISTS ot_rate_per_hour,
--     DROP COLUMN IF EXISTS multiplier_basis,
--     DROP COLUMN IF EXISTS hra_amount,
--     DROP COLUMN IF EXISTS allowance_amount,
--     DROP COLUMN IF EXISTS bonus_amount;
--   ALTER TABLE mis_employees
--     DROP COLUMN IF EXISTS wage_type_code,
--     DROP COLUMN IF EXISTS pay_type,
--     DROP COLUMN IF EXISTS sunday_paid;
--   DROP TYPE IF EXISTS mis_payroll_period_status;
--   DROP TYPE IF EXISTS mis_extra_pay_status;
--   DROP TYPE IF EXISTS mis_extra_pay_scope;
--   DROP TYPE IF EXISTS mis_extra_pay_kind;
--   DROP TYPE IF EXISTS mis_pay_component;
--   DROP TYPE IF EXISTS mis_pay_basis;
--   DROP TYPE IF EXISTS mis_pay_type;
