/**
 * V2 Epic 2 — the arithmetic of an order's earmarked stock.
 *
 * A PO's BOM ref or a GRN line's order ref is free text; it links to an order only when it IS
 * an order number (`ORD-YYYYMM-nnnnn`, `orders.ts#nextOrderNumber`). Anything else — a BOM
 * code, a note — earmarks nothing and the delivery lands in general stock, as it does today.
 *
 * Pure: no Prisma, no React.
 */

const ORDER_NUMBER = /^ORD-\d{6}-\d{5}$/i;

/** The order number a reference names, normalised, or null when it is not one. */
export function orderNumberFromRef(ref: string | null | undefined): string | null {
  const trimmed = ref?.trim().toUpperCase() ?? '';
  return ORDER_NUMBER.test(trimmed) ? trimmed : null;
}

export type AllocationFigures = { allocated: number; issued: number };

/**
 * The one rule for "how much of an earmark is used": issues count only from the order's FIRST
 * earmark of that item onward — stock issued from general stock before anything was tagged is
 * not drawn against the tag. Keyed by whatever `keyOf` returns (item id, or order|item).
 */
export function foldAllocationFigures<A extends { allocatedQty: number; createdAt: Date }, I extends { changeQty: number; createdAt: Date }>(
  allocations: A[],
  issues: I[],
  keyOf: { allocation: (a: A) => string; issue: (i: I) => string },
): Map<string, AllocationFigures> {
  const acc = new Map<string, AllocationFigures & { since: Date }>();
  for (const a of allocations) {
    const k = keyOf.allocation(a);
    const f = acc.get(k) ?? { allocated: 0, issued: 0, since: a.createdAt };
    f.allocated += a.allocatedQty;
    if (a.createdAt < f.since) f.since = a.createdAt;
    acc.set(k, f);
  }
  for (const i of issues) {
    const f = acc.get(keyOf.issue(i));
    if (f && i.createdAt >= f.since) f.issued += -i.changeQty;
  }
  return new Map([...acc].map(([k, { allocated, issued }]) => [k, { allocated, issued }]));
}

export function remainingAllocation(f: AllocationFigures): number {
  return Math.round((f.allocated - f.issued) * 100) / 100;
}

/**
 * The cap: (already issued + requested) <= allocated, with nothing over. Only enforced where the
 * order HAS an allocation for the item — an item never earmarked for the order is issued from
 * general stock exactly as before, so a factory that has not started tagging deliveries is not
 * locked out of issuing.
 */
export function issueRefusal(
  f: AllocationFigures,
  requested: number,
  label: string,
): string | null {
  if (f.allocated <= 0) return null;
  const remaining = remainingAllocation(f);
  if (requested <= remaining) return null;
  return `${label} — asked for ${requested}, but only ${remaining} of the ${f.allocated} allocated to this order is left`;
}
