/** R3-STK B17 — one definition of "low stock" for the dashboard and the stock page. Pure. */

/** At or below the reorder level. A level of 0 is a real level; null means none is set. */
export function isLowStock(balance: number, reorderLevel: number | null | undefined): boolean {
  return reorderLevel !== null && reorderLevel !== undefined && balance <= reorderLevel;
}

export type StockStatus = 'critical' | 'warning' | 'ok';

export function stockStatus(balance: number, reorderLevel: number | null | undefined): StockStatus {
  if (balance <= 0) return 'critical';
  return isLowStock(balance, reorderLevel) ? 'warning' : 'ok';
}

const CATEGORIES = ['RAW_MATERIAL', 'CONSUMABLE', 'EQUIPMENT', 'OTHER'] as const;
const STATUSES: readonly StockStatus[] = ['critical', 'warning', 'ok'];

/** The stock list's URL filters. Anything else is no filter. */
export function parseStockFilters(raw: { category?: unknown; status?: unknown }) {
  return { category: CATEGORIES.find((c) => c === raw.category), status: STATUSES.find((s) => s === raw.status) };
}
