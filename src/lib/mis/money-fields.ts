/**
 * The material-money keys: what a thing costs, as opposed to what someone is paid.
 *
 * D24: money is Owner-only and "the server does not send it to anyone else". `ratePerUnit` (a BOM
 * line or a PO line) and `pricePerUnit` (a stock item) are the two places a material's price is
 * stored. A screen that hides the column has still downloaded the value, so every server function
 * that returns a row carrying one of these hands it through `withoutMoneyFields` unless the caller
 * holds `wages.read` (F-06).
 *
 * The same list is the audit writer's redaction list (`server/mis/audit.ts`), so a price cannot be
 * kept out of a response and then written into the audit table.
 *
 * Pure: no Prisma, no React.
 */

import { can } from './permissions';
import type { MisRoleName } from './roles';

export const MONEY_FIELDS = ['ratePerUnit', 'pricePerUnit'] as const;
export type MoneyField = (typeof MONEY_FIELDS)[number];

/** A Prisma `Decimal` (or anything number-like with `toNumber`) is a leaf, never walked into. */
type Leaf = Date | { toNumber(): number } | string | number | boolean | bigint | null | undefined;

/**
 * `T` with every money key made OPTIONAL at any depth — after withholding it is genuinely absent,
 * and a type that still promised a number would invite `Number(row.ratePerUnit)` on `undefined`.
 */
export type WithoutMoney<T> = T extends Leaf
  ? T
  : T extends readonly (infer U)[]
    ? WithoutMoney<U>[]
    : { [K in keyof T as K extends MoneyField ? never : K]: WithoutMoney<T[K]> } & {
        [K in keyof T as K extends MoneyField ? K : never]?: T[K];
      };

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * A copy with every money key REMOVED (not blanked, not null) from plain objects and arrays, at any
 * depth. Dates, Decimals and other class instances are left as they are. The input is never
 * mutated, so an Owner reading afterwards is unaffected.
 */
export function withoutMoneyFields<T>(value: T): WithoutMoney<T> {
  if (Array.isArray(value)) return value.map((v) => withoutMoneyFields(v)) as WithoutMoney<T>;
  if (!isPlain(value)) return value as WithoutMoney<T>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if ((MONEY_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = withoutMoneyFields(v);
  }
  return out as WithoutMoney<T>;
}

/**
 * `value` as `role` may see it: unchanged for a role holding `wages.read`, otherwise with every
 * money key removed. Used on what the WRITE functions return, so a person who may edit a PO line or
 * an item — an Admin — is not handed back the Owner's price by an update that did not touch it.
 */
export function forRole<T>(role: MisRoleName | null | undefined, value: T): T | WithoutMoney<T> {
  return can(role, 'wages.read') ? value : withoutMoneyFields(value);
}
