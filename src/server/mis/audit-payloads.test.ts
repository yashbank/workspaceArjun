/**
 * Phase 14 · MIS-46 — audit payloads, read from the source.
 *
 * `wage-leak.test.ts` proves what the wage functions WRITE at runtime. This proves nothing
 * else in the codebase writes money into `before` / `after`, by reading every
 * `logAuditEvent({...})` call site. A new call that puts a money-looking key into a payload
 * turns this red and has to be looked at by a person.
 *
 * The registry below is what is known today and why. It is exact: an entry that no longer
 * exists fails too, so the list cannot rot.
 */
import { describe, expect, it } from 'vitest';

import { auditCallsIn, exportedFunctions, listFiles, parse } from './testing/ast';
import ts from 'typescript';

const FILES = [
  ...listFiles('src/server/mis', /\.ts$/),
  ...listFiles('src/app/(mis)', /\.tsx?$/),
  ...listFiles('src/app/api/mis', /\.ts$/),
].filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes('/testing/'));

const CALLS = FILES.flatMap((f) => auditCallsIn(f));

/** Keys that put a money figure into an audit payload. `ruleValue` is generic: it is money when the rule is. */
const MONEY_KEY = /wage|salary|gross|otpay|penalty|netpay|payroll|amount|rate$|ratePer|^price|pricePer|cost|ruleValue/i;

describe('audit call sites', () => {
  it('found the call sites (a broken glob would pass vacuously)', () => {
    expect(CALLS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(CALLS.map((c) => c.file)).size).toBeGreaterThanOrEqual(25);
  });

  it('every payload key that looks like money is on the reviewed list — and every entry on the list still exists', () => {
    const found = CALLS.flatMap((c) =>
      [...new Set(c.deepKeys.filter((k) => MONEY_KEY.test(k)))].map((k) => `${c.file.replace('src/', '')} · ${c.action} · ${k}`),
    ).sort();

    expect(found).toEqual(
      [
        // Ordinary rules audit old and new value. The three wage rules audit the KEY only (F-04, closed in
        // 14F) — the conditional in createRuleRevision is why this entry still appears; wage-leak.test.ts
        // proves at runtime that a wage rule's value never reaches the row.
        // D12 (24E): the action is `opts.action ?? 'UPDATE_RULE'` — SCHEDULE_RULE for a scheduled change — so the
        // same call site is listed under that text. Same conditional, same guarantee: wage-leak.test.ts and
        // business-rules-schedule.test.ts prove at runtime that a wage rule's figure never reaches the row.
        "server/mis/business-rules.ts · opts.action ?? 'UPDATE_RULE' · ruleValue",
        // A stock price is not a wage; the store-item edit records the price change on purpose.
        'server/mis/store.ts · store.item.update · pricePerUnit',
      ].sort(),
    );
  });

  it('no payload key is called wage, salary, gross, netPay or payroll — anywhere', () => {
    const hits = CALLS.flatMap((c) => c.deepKeys.filter((k) => /wage|salary|gross|netpay|payroll/i.test(k)).map((k) => `${c.file}:${k}`));
    expect(hits).toEqual([]);
  });
});

describe('the wage modules audit through auditSafe() only', () => {
  it('every audit call in wage-type.ts hands over auditSafe(row) or a literal without an amount', () => {
    const calls = auditCallsIn('src/server/mis/wage-type.ts');
    expect(calls.length).toBe(3);
    for (const c of calls) {
      const ok = c.payloadKeys.every((k) => k.startsWith('=auditSafe(')) || !c.payloadKeys.some((k) => /amount|wage|rate/i.test(k));
      expect(ok, `${c.action}: ${c.payloadKeys.join(',')}`).toBe(true);
    }
  });

  it('auditSafe() itself has no `amount` key — and does list the safe ones', () => {
    const sf = parse('src/server/mis/wage-type.ts');
    let keys: string[] = [];
    sf.forEachChild((n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.text === 'auditSafe') {
        const visit = (x: ts.Node) => {
          if (ts.isPropertyAssignment(x)) keys.push(x.name.getText());
          ts.forEachChild(x, visit);
        };
        visit(n);
      }
    });
    keys = keys.sort();
    // Phase 25 added `multiplierBasis` — a basis FLAG (PER_MONTH/PER_HOUR), not money, same
    // reasoning as `unit` already being on this list.
    expect(keys).toEqual(['code', 'effectiveFrom', 'id', 'isActive', 'multiplierBasis', 'name', 'nameHi', 'unit']);
  });

  it('payroll.ts writes no audit row at all — computing a payslip records nothing about its figures', () => {
    expect(auditCallsIn('src/server/mis/payroll.ts')).toEqual([]);
    expect(exportedFunctions('src/server/mis/payroll.ts').length).toBe(2);
  });
});
