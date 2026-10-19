-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (Supabase SQL editor, using
-- `apply-in-sql-editor.sql` beside this file, or `pnpm db:deploy` after moving this folder to
-- prisma/migrations/). No agent applies DDL to the live database.
--
-- R2-102 — leave types PAID / UNPAID (Owner-only setting, payroll pays approved leave of a PAID type).
-- Additive and idempotent: one new table, no change to any existing table or column.
--
--   1. mis_leave_pay_rules (leave_type mis_leave_type, paid, effective_from DATE, reason,
--      changed_by_id, created_at). Append-only history: a change is a new row, never an edit.
--      No seed rows — with no row the code's built-in default applies (every type unpaid, as payroll was before R2-102; the Owner turns CL/SL/EL to Paid in Settings > Leave pay).
--
-- DEPENDS ON: 20261019000000_r2_batch2_schema (creates the mis_leave_type enum). Run that first.
--
-- BEFORE THIS RUNS: payroll and the Settings > Leave pay screen read the defaults (a missing table
-- reads as "no change made yet"); saving a change says the database update is still needed.
--
-- ROLLBACK (only if you must undo; harmless to leave — the code falls back to the defaults):
--   DROP TABLE IF EXISTS mis_leave_pay_rules;
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261020000000_r2_leave_pay_setting';

CREATE TABLE IF NOT EXISTS mis_leave_pay_rules (
  id              UUID           NOT NULL DEFAULT gen_random_uuid(),
  leave_type      mis_leave_type NOT NULL,
  paid            BOOLEAN        NOT NULL,
  effective_from  DATE           NOT NULL,
  reason          TEXT,
  changed_by_id   UUID,
  created_at      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT mis_leave_pay_rules_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS mis_leave_pay_rules_leave_type_effective_from_idx
  ON mis_leave_pay_rules(leave_type, effective_from);
