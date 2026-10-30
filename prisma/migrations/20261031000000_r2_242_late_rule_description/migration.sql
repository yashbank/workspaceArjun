-- R2-242 / R2-260: the late-rule audience is a choice of three words, not free text. Data only, no schema change.
UPDATE "mis_business_rules"
SET "label" = 'Late rule applies to',
    "description" = 'Who is marked late after the grace: ALL employees, DAILY-paid only, or MONTHLY-paid only.'
WHERE "rule_key" = 'attendance.late_rule_workers';
UPDATE "mis_business_rules"
SET "rule_value" = 'ALL'
WHERE "rule_key" = 'attendance.late_rule_workers' AND upper(trim("rule_value")) NOT IN ('ALL', 'DAILY', 'MONTHLY');
