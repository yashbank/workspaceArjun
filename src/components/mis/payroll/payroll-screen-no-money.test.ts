/**
 * W9 (Phase 25): the payroll SCREEN carries counts, not money — for every role, including the
 * Owner. Reads the source of the screen and its page so a later edit cannot reintroduce a money
 * field even by accident; `wage-screens.test.tsx` proves the same thing at the props-payload
 * level (`moneyFreeForAll: true`), this pins it at the source level too.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MONEY_IDENTIFIERS = [
  'basicWage', 'otPay', 'hra', 'allowance', 'bonus', 'extraPay', 'latePenalty', 'grossPay',
];

const FILES = [
  'src/components/mis/payroll/payroll-screen.tsx',
  'src/app/(mis)/mis/payroll/page.tsx',
  'src/app/(mis)/mis/payroll/actions.ts',
];

describe('the payroll screen never carries a money field (W9, D24)', () => {
  it.each(FILES)('%s has none of the money identifiers', (file) => {
    // `allowanceDays` / "allowance days" is the honest COUNT this screen does show (W9's own
    // "Export contains" list) — strip it before checking for the bare money field `allowance`.
    const source = readFileSync(file, 'utf8').replace(/allowance\s*[Dd]ays/g, '');
    const hits = MONEY_IDENTIFIERS.filter((id) => new RegExp(`\\b${id}\\b`).test(source));
    expect(hits, `${file} contains: ${hits.join(', ')}`).toEqual([]);
  });
});
