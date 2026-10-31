import { roundQty } from './quantity';
import type { MisRoleName } from './roles';

/**
 * R3-STK — what a delivery may take against a PO line, and what the PO's status is afterwards.
 * Pure: no Prisma, no React.
 */

/** A delivery may exceed the ordered quantity by this fraction (2%) without anyone's say-so. */
export const RECEIPT_TOLERANCE = 0.02;

/** The most a PO line may receive in total without an override: ordered + 2%, rounded to 2 dp. */
export function maxReceivable(ordered: number): number {
  return roundQty(ordered * (1 + RECEIPT_TOLERANCE));
}

/** R2-279: past ordered + 5% an Admin's reason is not enough — only the Owner may accept it (owner decision, round 6B). */
export const RECEIPT_HARD_CEILING = 0.05;

export function maxOverridable(ordered: number): number {
  return roundQty(ordered * (1 + RECEIPT_HARD_CEILING));
}

export type ReceiptVerdict =
  | { kind: 'OK'; max: number; receivedTotal: number }
  /** Beyond tolerance, but the actor is ADMIN/OWNER (OWNER alone past the 5% ceiling) and gave a reason: allowed, and audited. */
  | { kind: 'OVERRIDE'; max: number; receivedTotal: number; reason: string }
  /** `beyondCeiling`: past 5%, where an Admin cannot override at all. */
  | { kind: 'REFUSED'; max: number; receivedTotal: number; beyondCeiling?: boolean; ceiling?: number };

/** Roles that may override the cap (the role comes from `requirePermission`, never from the client). */
export function mayOverrideReceipt(role: MisRoleName): boolean {
  return role === 'ADMIN' || role === 'OWNER';
}

/** A reason counts when it has 3 or more characters once trimmed. */
export function cleanOverReceiptReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed.length >= 3 ? trimmed : null;
}

/**
 * Is `qty` more on a PO line allowed? `receivedSoFar` is what confirmed GRNs booked; `alreadyOnThisGrn` is the
 * rest of the same delivery for that line.
 */
export function receiptVerdict(input: {
  ordered: number;
  receivedSoFar: number;
  alreadyOnThisGrn?: number;
  qty: number;
  role: MisRoleName;
  overReceiptReason?: string | null;
}): ReceiptVerdict {
  const max = maxReceivable(input.ordered);
  const receivedTotal = roundQty(input.receivedSoFar + (input.alreadyOnThisGrn ?? 0) + input.qty);
  if (receivedTotal <= max) return { kind: 'OK', max, receivedTotal };
  const reason = cleanOverReceiptReason(input.overReceiptReason);
  const ceiling = maxOverridable(input.ordered);
  if (receivedTotal > ceiling) {
    // R2-279: the hard ceiling. The Owner alone, with a reason.
    if (input.role === 'OWNER' && reason) return { kind: 'OVERRIDE', max, receivedTotal, reason };
    return { kind: 'REFUSED', max, receivedTotal, beyondCeiling: true, ceiling };
  }
  if (mayOverrideReceipt(input.role) && reason) return { kind: 'OVERRIDE', max, receivedTotal, reason };
  return { kind: 'REFUSED', max, receivedTotal };
}

/** The sentence for a refused line. An Admin/Owner is told how to override; anyone else is told to ask one. */
export function overReceiptMessage(label: string, max: number, unit: string, canOverride = false): string {
  const head = `${label} exceeds the order by more than 2% (max ${max}${unit ? ` ${unit}` : ''}).`;
  return canOverride ? `${head} Give a reason (at least 3 characters) to override.` : `${head} Ask an Admin to override.`;
}

/** R2-279: the sentence past the 5% ceiling. The Owner is told how; everyone else is told it is the Owner's call. */
export function overCeilingMessage(label: string, ceiling: number, unit: string, isOwner = false): string {
  const head = `${label} exceeds the order by more than 5% (ceiling ${ceiling}${unit ? ` ${unit}` : ''}).`;
  return isOwner ? `${head} Give a reason (at least 3 characters) to accept it anyway.` : `${head} Only the Owner can accept this much; ask them.`;
}

/** PO statuses that goods may be received against: approved, and part-received. */
export const RECEIVABLE_PO_STATUSES = ['APPROVED', 'RECEIVING', 'PARTIAL'] as const;

export function isReceivablePoStatus(status: string | null | undefined): boolean {
  return (RECEIVABLE_PO_STATUSES as readonly string[]).includes(status ?? '');
}

export function poNotReceivableMessage(poNumber: string, status: string | null | undefined): string {
  return `PO ${poNumber} is ${status ?? 'unknown'}; goods can only be received against an approved PO.`;
}

type Qty = number | { toNumber(): number };
const asNumber = (v: Qty) => (typeof v === 'number' ? v : v.toNumber());

/**
 * The PO status after a receipt: COMPLETE when every line is fully received, PARTIAL when something has
 * arrived but not everything, null (leave the status alone) when there are no lines or nothing has arrived.
 */
export function poStatusAfterReceipt(
  lines: readonly { quantity: Qty; receivedQuantity: Qty }[],
): 'COMPLETE' | 'PARTIAL' | null {
  if (lines.length === 0) return null;
  if (lines.every((l) => asNumber(l.receivedQuantity) >= asNumber(l.quantity))) return 'COMPLETE';
  return lines.some((l) => asNumber(l.receivedQuantity) > 0) ? 'PARTIAL' : null;
}
