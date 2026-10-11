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

/** EQUIPMENT and OTHER are department overhead: they go to a department, never to a customer order. */
export function isOverheadCategory(category: string | null | undefined): boolean {
  return category === 'EQUIPMENT' || category === 'OTHER';
}

/**
 * The category rule for an issue or request, whichever door it comes through: overhead lines may
 * not be booked to an order, and with no order they need a department to carry them. Returns the
 * refusal sentence, or null when every line is allowed.
 */
export function categoryRefusal(
  lines: readonly { name: string; category: string | null | undefined }[],
  target: { orderId?: string | null; departmentId?: string | null },
): string | null {
  const overhead = lines.filter((l) => isOverheadCategory(l.category)).map((l) => l.name);
  if (overhead.length === 0) return null;
  if (target.orderId) {
    return `Equipment and other items are department overhead and cannot be booked to an order: ${overhead.join(', ')}`;
  }
  if (!target.departmentId) {
    return `Equipment and other items must be issued to a department: ${overhead.join(', ')}`;
  }
  return null;
}
