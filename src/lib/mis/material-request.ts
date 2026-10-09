/**
 * V2 Epic 3 — the two rules of a Material Issue Note, as pure functions.
 *
 * - Only RAW_MATERIAL and CONSUMABLE may be booked against a customer order. EQUIPMENT and OTHER
 *   are department overhead and never carry an order.
 * - The Store may issue less than asked, never more: 0 <= actualIssuedQty <= requestedQty.
 *
 * Pure: no Prisma, no React.
 */

export const ORDER_ISSUABLE_CATEGORIES = ['RAW_MATERIAL', 'CONSUMABLE'] as const;

export function isOrderIssuable(category: string): boolean {
  return (ORDER_ISSUABLE_CATEGORIES as readonly string[]).includes(category);
}

/** Item names that may NOT be booked to an order. Empty when there is no order or every line qualifies. */
export function linesRefusedForOrder(
  lines: readonly { name: string; category: string }[],
  orderId: string | null | undefined,
): string[] {
  if (!orderId) return [];
  return lines.filter((l) => !isOrderIssuable(l.category)).map((l) => l.name);
}

/** Throws unless 0 <= actual <= requested. Returns the validated number. */
export function cappedIssueQty(requested: number, actual: number): number {
  if (!Number.isFinite(actual) || actual < 0) throw new Error('Issued quantity cannot be negative.');
  if (actual > requested) {
    throw new Error(`Cannot issue ${actual}: only ${requested} was requested.`);
  }
  return actual;
}
