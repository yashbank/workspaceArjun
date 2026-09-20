/**
 * The wage-type code system — pure, client-safe, no Prisma import.
 *
 * Every screen outside src/server/mis/wage-type.ts references a wage by this
 * code (e.g. "WG-DAILY-01"), never by its amount. Codes are generated here,
 * never typed by the Owner, so "the code system" and "no amount on screen"
 * are the same guarantee.
 */

import type { MisWageUnit } from '@/generated/prisma/enums';

const SEQUENCE_WIDTH = 2;

/** The reserved code payroll.ts falls back to until the Owner creates one. */
export const DEFAULT_DAILY_WAGE_CODE = 'WG-DAILY-01';

export function formatWageCode(unit: MisWageUnit, sequence: number): string {
  return `WG-${unit}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`;
}

/**
 * The next unused code for `unit`, given every code that already exists
 * (any unit). Existing codes outside this unit's prefix are ignored; a gap
 * left by a deleted code is not reused — the next number always wins.
 */
export function nextWageCode(unit: MisWageUnit, existingCodes: readonly string[]): string {
  const prefix = `WG-${unit}-`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const sequence = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > max) max = sequence;
  }
  return formatWageCode(unit, max + 1);
}
