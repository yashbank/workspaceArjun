/**
 * Which business rules are money.
 *
 * Payroll reads three rules as its rates (see `server/mis/payroll.ts`): the daily wage default,
 * the overtime multiplier and the late-penalty rate. Each moves every payslip, so they are wage
 * data — Owner only (`wages.read`, S9 / D24) — even though they sit in the same effective-dated
 * store as an ordinary setting like the line-clearance mode.
 *
 * The general settings list (`getBusinessRules`) and the general editor (`updateBusinessRule`)
 * are gated on `settings.*`, which Admin holds. Before Phase 14F neither knew a rule could be a
 * wage, so an Admin could read and rewrite the rates (F-02, F-03). Both now ask this file.
 *
 * Pure: no Prisma, no React. `rule-keys.test.ts` fails if payroll starts reading a rule that is
 * not listed here, so a new wage rule cannot be added without being classified.
 */

export const WAGE_RULE_KEYS = ['DAILY_WAGE_DEFAULT', 'OT_MULTIPLIER', 'LATE_PENALTY_PER_MIN'] as const;

export type WageRuleKey = (typeof WAGE_RULE_KEYS)[number];

export function isWageRuleKey(ruleKey: string): ruleKey is WageRuleKey {
  return (WAGE_RULE_KEYS as readonly string[]).includes(ruleKey);
}

/**
 * R2-228/231/232: the payroll-policy rules payroll reads beside the three rates. They move every
 * payslip too (the OT multiplier, which weekly off is paid, who keeps HRA), so they get the same
 * treatment as a wage rule — Owner only, kept out of Admin's list and out of audit values. A separate
 * list because `WAGE_RULE_KEYS` is pinned to the three rates by `wage-rule-keys.test.ts`.
 */
export const PAYROLL_POLICY_RULE_KEYS = [
  'attendance.ot_rate',
  'attendance.weekly_off',
  'sunday.paid_if_adjacent',
  'salary.rent_min_days',
  'salary.rent_count_holidays',
  // R2-324: statutory deductions, Owner-only like every payroll rule.
  'salary.pf_percent',
  'salary.esic_percent',
  'salary.esic_ceiling',
  'salary.pt_monthly',
  'salary.pt_min_gross',
] as const;

export type PayrollPolicyRuleKey = (typeof PAYROLL_POLICY_RULE_KEYS)[number];

export function isPayrollPolicyRuleKey(ruleKey: string): ruleKey is PayrollPolicyRuleKey {
  return (PAYROLL_POLICY_RULE_KEYS as readonly string[]).includes(ruleKey);
}

/** Any rule only a wages.read holder may see or change. */
export function isOwnerOnlyPayrollRuleKey(ruleKey: string): boolean {
  return isWageRuleKey(ruleKey) || isPayrollPolicyRuleKey(ruleKey);
}
