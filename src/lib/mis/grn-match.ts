/**
 * V2 Epic 1 — the arithmetic of a delivery note and of the 3-way match (PO ↔ GRN ↔ invoice).
 *
 * Pure: no Prisma, no React.
 */
import { withoutKeys } from './money-fields';

/** Invoice money on a GRN / supplier-invoice row: Owner-only, like `MONEY_FIELDS` (D24). */
export const INVOICE_MONEY_FIELDS = ['supplierInvoiceAmount', 'invoiceAmount'] as const;

export function withoutInvoiceMoney<T>(value: T): T {
  return withoutKeys(value, INVOICE_MONEY_FIELDS) as T;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * short = dc − (received + damage). Null when no DC quantity was entered. Refuses a delivery that
 * claims more arrived than the challan carried — that is a typo, not a surplus.
 */
export function shortQuantity(dc: number | null | undefined, received: number, damage: number): number | null {
  if (received < 0 || damage < 0 || (dc ?? 0) < 0) throw new Error('Quantities cannot be negative.');
  if (dc === null || dc === undefined) return null;
  const accounted = round2(received + damage);
  if (accounted > dc) {
    throw new Error(`Received ${received} + damaged ${damage} is more than the ${dc} on the delivery challan.`);
  }
  return round2(dc - accounted);
}

export type MatchPoLine = { id: string; description: string; quantity: number; ratePerUnit?: number | null };
export type MatchGrnLine = { poItemId: string; receivedQty: number; damageQuantity: number; shortQuantity: number | null; confirmed: boolean };
export type MatchInvoice = { invoiceNo: string; invoiceAmount?: number | null };

export type MatchLine = {
  poItemId: string;
  description: string;
  ordered: number;
  received: number;
  damaged: number;
  short: number;
  outstanding: number;
};

export type ThreeWayMatch = {
  lines: MatchLine[];
  totals: { ordered: number; received: number; damaged: number; short: number; outstanding: number };
  invoiceCount: number;
  /** Present only when every PO line carried a rate (the Owner's read). Raw numbers; the server formats. */
  money?: { poValue: number; receivedValue: number; invoiced: number; variance: number };
};

/** Confirmed GRN lines only — a draft has not been received yet. */
export function threeWayMatch(poLines: MatchPoLine[], grnLines: MatchGrnLine[], invoices: MatchInvoice[]): ThreeWayMatch {
  const lines = poLines.map((po) => {
    const mine = grnLines.filter((g) => g.confirmed && g.poItemId === po.id);
    const received = round2(mine.reduce((s, g) => s + g.receivedQty, 0));
    const damaged = round2(mine.reduce((s, g) => s + g.damageQuantity, 0));
    const short = round2(mine.reduce((s, g) => s + (g.shortQuantity ?? 0), 0));
    return { poItemId: po.id, description: po.description, ordered: po.quantity, received, damaged, short, outstanding: round2(po.quantity - received) };
  });
  const sum = (k: keyof MatchLine) => round2(lines.reduce((s, l) => s + (l[k] as number), 0));
  const totals = { ordered: sum('ordered'), received: sum('received'), damaged: sum('damaged'), short: sum('short'), outstanding: sum('outstanding') };

  const priced = poLines.every((p) => typeof p.ratePerUnit === 'number');
  const money = priced
    ? (() => {
        const poValue = round2(poLines.reduce((s, p) => s + p.quantity * (p.ratePerUnit as number), 0));
        const receivedValue = round2(
          lines.reduce((s, l) => s + l.received * (poLines.find((p) => p.id === l.poItemId)!.ratePerUnit as number), 0),
        );
        const invoiced = round2(invoices.reduce((s, i) => s + (i.invoiceAmount ?? 0), 0));
        return { poValue, receivedValue, invoiced, variance: round2(invoiced - receivedValue) };
      })()
    : undefined;

  return { lines, totals, invoiceCount: invoices.length, ...(money ? { money } : {}) };
}
