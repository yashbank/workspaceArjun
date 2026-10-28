-- NOT APPLIED. Parked in prisma/migrations-pending/ for the OWNER to run (no agent applies DDL).
--
-- R2-179. Additive and idempotent:
--   1. mis_attendance.break_out_at / break_in_at TIMESTAMP NULL — lunch break, recorded beside (never over) clock_in/clock_out.
--   2. Seeds the Owner rule ATTENDANCE_LUNCH_BREAK_MINUTES = 30 (paid lunch allowance) so it shows on the settings screen.
-- ORDER: apply BEFORE deploying code built on the new schema.prisma.
--
-- ROLLBACK:
--   ALTER TABLE mis_attendance DROP COLUMN IF EXISTS break_out_at, DROP COLUMN IF EXISTS break_in_at;
--   DELETE FROM mis_business_rules WHERE rule_key = 'ATTENDANCE_LUNCH_BREAK_MINUTES';
--   DELETE FROM _prisma_migrations WHERE migration_name = '20261028000001_r2_179_lunch_break';

ALTER TABLE mis_attendance ADD COLUMN IF NOT EXISTS break_out_at TIMESTAMP(3);
ALTER TABLE mis_attendance ADD COLUMN IF NOT EXISTS break_in_at TIMESTAMP(3);

INSERT INTO mis_business_rules (id, rule_key, rule_value, value_type, label, description, effective_from, updated_at)
SELECT gen_random_uuid(), 'ATTENDANCE_LUNCH_BREAK_MINUTES', '30', 'number', 'Lunch break (minutes)',
  'Paid lunch allowance. A break up to this length is paid; minutes beyond it are deducted from worked time and overtime.',
  CURRENT_DATE, now()
WHERE NOT EXISTS (SELECT 1 FROM mis_business_rules WHERE rule_key = 'ATTENDANCE_LUNCH_BREAK_MINUTES');
