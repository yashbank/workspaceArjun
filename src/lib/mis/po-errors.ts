/**
 * D1 (tester round 2) — a PO raised against an order whose BOM is not APPROVED is refused with this
 * error. The message starts with a fixed prefix so the client, which only ever receives the
 * `ActionResult.detail` string, can tell it apart from any other refusal and show it as a popup
 * rather than a toast.
 *
 * Pure: no Prisma, no React.
 */
export const BOM_NOT_APPROVED_PREFIX = 'BOM is not approved';

export class BomNotApprovedError extends Error {
  constructor(orderRef: string) {
    super(`${BOM_NOT_APPROVED_PREFIX} for order ${orderRef}. Get the BOM approved first, or raise this PO as buffer stock.`);
    this.name = 'BomNotApprovedError';
  }
}

export function isBomNotApprovedDetail(detail: string | null | undefined): boolean {
  return (detail ?? '').startsWith(BOM_NOT_APPROVED_PREFIX);
}
