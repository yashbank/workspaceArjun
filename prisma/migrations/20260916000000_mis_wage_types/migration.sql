-- Phase 1 (MIS-9, MIS-44, MIS-45) — Wage types & the code system.
--
-- Replaces the single flat DAILY_WAGE_DEFAULT business rule with a real,
-- Owner-only wage-type master. Versioned exactly like mis_business_rules:
-- multiple rows can share a code with different effective_from dates, and a
-- caller takes the latest row whose effective_from has passed. Every other
-- screen references `code` (e.g. "WG-DAILY-01"), never `amount` — see
-- src/server/mis/wage-type.ts (Half B), which is the only reader of `amount`.
--
-- No FK against existing tables, so there is nothing to backfill.

DO $$ BEGIN
  CREATE TYPE "mis_wage_unit" AS ENUM ('DAILY','MONTHLY','HOURLY','PIECE_RATE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "mis_wage_types" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code"           TEXT        NOT NULL,
  "name"           TEXT        NOT NULL,
  "name_hi"        TEXT,
  "amount"         DECIMAL(12,2) NOT NULL,
  "unit"           "mis_wage_unit" NOT NULL DEFAULT 'DAILY',
  "effective_from" DATE        NOT NULL DEFAULT CURRENT_DATE,
  "is_active"      BOOLEAN     NOT NULL DEFAULT TRUE,
  "deleted_at"     TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mis_wage_types_code_date_key" UNIQUE ("code", "effective_from")
);

CREATE INDEX IF NOT EXISTS "mis_wage_types_code_idx" ON "mis_wage_types" ("code");
CREATE INDEX IF NOT EXISTS "mis_wage_types_deleted_at_idx" ON "mis_wage_types" ("deleted_at");

-- Prisma side (schema.prisma) already added in the same commit:
--
--   enum MisWageUnit { DAILY MONTHLY HOURLY PIECE_RATE @@map("mis_wage_unit") }
--   model MisWageType { ... @@map("mis_wage_types") }
--
-- Then `pnpm db:generate`. `prisma generate` cannot run from the agent shell
-- (engine download is 403-blocked) — this must run on the Mac before any
-- TypeScript references `MisWageType` or `MisWageUnit` (Half B).
--
-- Rollback:
--   DROP INDEX IF EXISTS "mis_wage_types_deleted_at_idx";
--   DROP INDEX IF EXISTS "mis_wage_types_code_idx";
--   DROP TABLE IF EXISTS "mis_wage_types";
--   DROP TYPE IF EXISTS "mis_wage_unit";
