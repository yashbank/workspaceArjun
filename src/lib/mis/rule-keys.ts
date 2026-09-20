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
