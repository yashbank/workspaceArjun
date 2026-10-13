/** R3-STK B17 — one definition of "low stock" for the dashboard and the stock page. Pure. */

/** At or below the reorder level. A level of 0 is a real level; null means none is set. */
export function isLowStock(balance: number, reorderLevel: number | null | undefined): boolean {
  return reorderLevel !== null && reorderLevel !== undefined && balance <= reorderLevel;
}
