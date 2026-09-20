/**
 * Which order statuses are closed — pure, client-safe.
 *
 * One list, because it used to be two that disagreed. `orders.ts` kept a private
 * `CLOSED_ORDER_STATUSES` (CANCELLED, DELIVERED, COMPLETED) while the production
 * screen's order picker excluded only CANCELLED, DELIVERED and DRAFT — so a
 * COMPLETED order was offered for production entry. D14 makes a closed order
 * refuse production, so the picker and the refusal must read the same list or
 * the screen will offer exactly the orders the server is about to reject.
 */
export const CLOSED_ORDER_STATUSES = ['CANCELLED', 'DELIVERED', 'COMPLETED'] as const;

export function isOrderClosed(status: string): boolean {
  return (CLOSED_ORDER_STATUSES as readonly string[]).includes(status);
}

/**
 * The status a reopened order returns to. Reopening deliberately does not try
 * to remember what an order was before it closed: the audit trail already
 * records that, and "back in production" is the only state in which the write
 * D14 refused is meaningful again.
 */
export const REOPENED_ORDER_STATUS = 'IN_PRODUCTION';
