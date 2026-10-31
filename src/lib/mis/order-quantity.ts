/**
 * R2-264 — the finished-goods quantity on an order. Pure, client-safe.
 *
 * Units are a fixed list (owner decision, round 6B): pieces, kilograms, reams. The quantity is mandatory on a new
 * order; orders made before the column existed carry null and are simply not gated on it.
 */
export const ORDER_UNITS = ['PIECE', 'KG', 'REAM'] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];
export const ORDER_UNIT_LABEL: Record<OrderUnit, string> = { PIECE: 'Pieces', KG: 'kg', REAM: 'Reams' };

export function isOrderUnit(value: unknown): value is OrderUnit {
  return typeof value === 'string' && (ORDER_UNITS as readonly string[]).includes(value);
}

/** The refusal to show, or null when `quantity` + `unit` make a valid target. */
export function validateOrderQuantity(quantity: unknown, unit: unknown): string | null {
  const qty = typeof quantity === 'string' ? Number(quantity) : quantity;
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) return 'Enter the order quantity (more than zero).';
  if (!isOrderUnit(unit)) return 'Pick the unit: Pieces, kg or Reams.';
  return null;
}

export function formatOrderQuantity(quantity: number | string | null | undefined, unit: string | null | undefined): string | null {
  if (quantity == null || unit == null) return null;
  const n = Number(quantity);
  if (!Number.isFinite(n)) return null;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${isOrderUnit(unit) ? ORDER_UNIT_LABEL[unit] : unit}`;
}
