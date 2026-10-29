/** R2-229 — the order number, `${prefix}-${yyyymm}-${suffix}`. Pure. The prefix is the `order.id_prefix` setting. */

export const DEFAULT_ORDER_PREFIX = 'ORD';
const MAX_PREFIX_LENGTH = 8;

/** Trim, upper-case, keep A-Z 0-9 and '-', cap at 8 chars; empty -> `ORD`. */
export function sanitizeOrderPrefix(raw: string | null | undefined): string {
  const clean = (raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, MAX_PREFIX_LENGTH).replace(/^-+|-+$/g, '');
  return clean || DEFAULT_ORDER_PREFIX;
}

export function formatOrderNumber(prefix: string | null | undefined, year: number, month: number, suffix: string): string {
  return `${sanitizeOrderPrefix(prefix)}-${year}${String(month).padStart(2, '0')}-${suffix}`;
}

export const ORDER_PREFIX_KEY = 'order.id_prefix';

/** The saved prefix, or `ORD` when unset or unreadable (a failed read must never block creating an order). */
export async function resolveOrderPrefix(read: (key: string) => Promise<string | null>): Promise<string> {
  try {
    return sanitizeOrderPrefix(await read(ORDER_PREFIX_KEY));
  } catch {
    return DEFAULT_ORDER_PREFIX;
  }
}
