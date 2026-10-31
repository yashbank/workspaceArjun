-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (`pnpm db:deploy` after moving this
-- folder to prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-324. Additive and idempotent.
--
--   1. mis_payroll_snapshot_lines: pf, esic, pt, advance, net_pay NUMERIC(12,2) NULL — the statutory deductions
--      and net pay frozen when a month is closed. NULL on months closed before this migration: payroll recomputes
--      them from the deduction rules when it reads such a line (never backfilled with fabricated figures).
--   2. mis_salary_advances — a salary advance to recover from one employee's pay in one month (Owner only).
--
-- ORDER OF OPERATIONS: apply BEFORE deploying code built on the current schema.prisma.
--
-- ROLLBACK (only if you must undo; code that selects these must be reverted first):
--   DROP TABLE IF EXISTS mis_salary_advances;
--   ALTER TABLE mis_payroll_snapshot_lines DROP COLUMN IF EXISTS pf, DROP COLUMN IF EXISTS esic,
--     DROP COLUMN IF EXISTS pt, DROP COLUMN IF EXISTS advance, DROP COLUMN IF EXISTS net_pay;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261101000001_r2_324_payroll_deductions';

ALTER TABLE mis_payroll_snapshot_lines
  ADD COLUMN IF NOT EXISTS pf NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS esic NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS pt NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS advance NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS net_pay NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS mis_salary_advances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES mis_employees(id),
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  notes         TEXT,
  created_by_id UUID,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mis_salary_advances_employee_id_year_month_idx ON mis_salary_advances(employee_id, year, month);
CREATE INDEX IF NOT EXISTS mis_salary_advances_year_month_idx ON mis_salary_advances(year, month);
