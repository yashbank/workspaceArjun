/**
 * Make a database row safe to hand to a Client Component.
 *
 * A Prisma `Decimal` is a class instance. React cannot send one from a Server Component to a Client Component
 * ("Only plain objects can be passed to Client Components from Server Components. Decimal objects are not
 * supported"); what arrives is an empty shell with no `toNumber`, so a screen that calls it crashes (the GRN detail
 * page did) and one that does arithmetic on it shows NaN. This walks plain objects and arrays and turns every Decimal
 * into a number. Dates stay Dates (React sends those). Money that must stay exact is the caller's to format on the
 * server — this is for quantities and for figures the caller has already decided the role may see (D24): it removes
 * nothing, so pass a row through `withoutMoneyFields` / `forRole` first where it carries a price.
 *
 * Pure: no Prisma, no React.
 */

type DecimalLike = { toNumber(): number };

export type Plain<T> = T extends DecimalLike
  ? number
  : T extends Date
    ? T
    : T extends readonly (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

const isDecimal = (v: unknown): v is DecimalLike =>
  typeof v === 'object' && v !== null && !(v instanceof Date) && typeof (v as { toNumber?: unknown }).toNumber === 'function';

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export function toPlain<T>(value: T): Plain<T> {
  if (isDecimal(value)) return value.toNumber() as Plain<T>;
  if (Array.isArray(value)) return value.map((v) => toPlain(v)) as Plain<T>;
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = toPlain(v);
    return out as Plain<T>;
  }
  return value as Plain<T>;
}
