/**
 * Phase 14F (F-02 / F-03 / F-04) — the wage-rule classifier stays true.
 *
 * `lib/mis/rule-keys.ts` names the business rules that are money. The general settings list, the
 * general editor and the audit writer all ask it. The failure to guard against is a NEW wage rate
 * that payroll starts reading and nobody classifies — it would reach an Admin through the general
 * door exactly as the old three did. So: whatever payroll reads as a rate must be on the list,
 * and nothing on the list may be a rule payroll no longer reads.
 */
import { describe, expect, it } from 'vitest';

import { WAGE_RULE_KEYS, isWageRuleKey } from '@/lib/mis/rule-keys';

import { listFiles, readSource } from './testing/ast';

describe('WAGE_RULE_KEYS', () => {
  it('is exactly the three rates payroll reads — a fourth needs a line here, and a decision', () => {
    expect([...WAGE_RULE_KEYS].sort()).toEqual(['DAILY_WAGE_DEFAULT', 'LATE_PENALTY_PER_MIN', 'OT_MULTIPLIER']);
  });

  it('isWageRuleKey is exact: no prefix, no case-folding, no near-miss', () => {
    for (const k of WAGE_RULE_KEYS) expect(isWageRuleKey(k)).toBe(true);
    for (const k of ['daily_wage_default', 'DAILY_WAGE', 'DAILY_WAGE_DEFAULT ', 'AQL_MAJOR_MAX', 'line_clearance.mode', '']) {
      expect(isWageRuleKey(k), JSON.stringify(k)).toBe(false);
    }
  });

  it('every rule payroll reads is classified, and every classified rule is read by payroll', () => {
    // Payroll reads its rates through the GATED history reader (F-08), not the ungated getRuleValue.
    const read = [...readSource('src/server/mis/payroll.ts').matchAll(/getWageRuleHistory\('([A-Za-z_.]+)'\)/g)].map((m) => m[1]);
    expect(read.length).toBeGreaterThanOrEqual(3); // the scan found the calls (a moved file would pass vacuously)
    expect(read.filter((k) => !isWageRuleKey(k)), 'payroll reads a rule that is not classified as money').toEqual([]);
    expect(WAGE_RULE_KEYS.filter((k) => !read.includes(k)), 'a classified wage rule payroll no longer reads').toEqual([]);
  });

  // The check above reads payroll.ts only. This one reads EVERY server file, so a wage rate read from
  // somewhere else — or a rule that reaches payroll through a constant — cannot slip past unclassified.
  it('no server file reads a rule that is not either classified as money or on the reviewed non-wage list', () => {
    const NON_WAGE_READS = new Set([
      "'ATTENDANCE_CORRECTION_DAYS'", // D21
      'FACTORY_TIMEZONE_KEY', // D22
      'LINE_CLEARANCE_MAX_MINUTES_KEY', // D7
      'LINE_CLEARANCE_MODE_KEY', // D7
      'OFFLINE_MAX_AGE_KEY', // D15
      'OFFLINE_SKEW_KEY', // D15
      'key', // getAqlThresholds maps over AQL_RULE_KEYS — the AQL keys, D6
      'PO_APPROVAL_THRESHOLD_KEY', // D2/D34 — a procurement policy threshold, not a wage rate
    ]);
    const reads: string[] = [];
    for (const file of listFiles('src', /\.tsx?$/).filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes('/generated/') && !f.includes('/testing/'))) {
      for (const m of readSource(file).matchAll(/getRuleValue\(([^)]+)\)/g)) {
        if (/export async function getRuleValue/.test(m[0]) || m[1].startsWith('ruleKey:')) continue;
        reads.push(`${file} ${m[1].trim()}`);
      }
    }
    expect(reads.length).toBeGreaterThanOrEqual(7); // the scan found the calls
    const unreviewed = reads.filter((r) => {
      const arg = r.split(' ').slice(1).join(' ');
      return !NON_WAGE_READS.has(arg) && !(WAGE_RULE_KEYS as readonly string[]).includes(arg.replace(/'/g, ''));
    });
    expect(unreviewed, 'classify the rule as money in lib/mis/rule-keys.ts, or add it to NON_WAGE_READS with its D-number').toEqual([]);
    // ...and NO wage rate is read through the ungated getRuleValue any more: payroll uses the
    // wages.read-gated history reader, so an ungated reader cannot carry a wage.
    const wageReads = reads.filter((r) => (WAGE_RULE_KEYS as readonly string[]).includes(r.split(' ')[1].replace(/'/g, '')));
    expect(wageReads).toEqual([]);
    // and the gated history reader is called from payroll.ts alone.
    const historyCallers = listFiles('src', /\.tsx?$/)
      .filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes('/testing/') && !f.includes('/generated/'))
      .filter((f) => /getWageRuleHistory\(/.test(readSource(f)) && !f.endsWith('business-rules.ts'));
    expect(historyCallers).toEqual(['src/server/mis/payroll.ts']);
  });

  it('the settings list, the editor and the audit writer all consult the classifier', () => {
    const src = readSource('src/server/mis/business-rules.ts');
    expect(src).toMatch(/import \{ isWageRuleKey[^}]*\} from '@\/lib\/mis\/rule-keys'/);
    // the reader filters, the editor gates, the audit omits — three uses, not one
    expect(src.match(/isWageRuleKey\(/g)!.length).toBeGreaterThanOrEqual(4);
    expect(src).toContain("requirePermission('wages.read', ruleKey)");
    expect(src).toContain("requirePermission('aql.read', ruleKey)");
  });
});
