/**
 * V2 Epic 4 — what the office is told the moment a delivery is confirmed: PO vs received per
 * line, damage and short, and (Owner only) the invoice against the received value.
 *
 * Pure: no Prisma, no React.
 */

export type GrnAlertLineInput = {
  description: string;
  ordered: number;
  received: number;
  damaged: number;
  short: number | null;
  ratePerUnit?: number | null;
};

export type GrnAlertLine = { description: string; ordered: number; received: number; damaged: number; short: number; underReceived: number };

export type GrnAlertPayload = {
  grnId: string;
  grnNumber: string;
  poNumber: string;
  supplierName: string | null;
  confirmedAt: string;
  lines: GrnAlertLine[];
  totals: { ordered: number; received: number; damaged: number; short: number };
  /** Something the office must look at: a short, damaged or under-received line, or a price variance. */
  attention: boolean;
  /** Owner payload only (D24). Formatted on the server; absent for the Admin copy. */
  money?: { receivedValue: string; invoiced: string; variance: string };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function grnAlertLines(lines: GrnAlertLineInput[]): { lines: GrnAlertLine[]; totals: GrnAlertPayload['totals']; attention: boolean } {
  const out = lines.map((l) => ({
    description: l.description,
    ordered: l.ordered,
    received: l.received,
    damaged: l.damaged,
    short: l.short ?? 0,
    underReceived: Math.max(0, round2(l.ordered - l.received)),
  }));
  const sum = (k: 'ordered' | 'received' | 'damaged' | 'short') => round2(out.reduce((s, l) => s + l[k], 0));
  const totals = { ordered: sum('ordered'), received: sum('received'), damaged: sum('damaged'), short: sum('short') };
  return { lines: out, totals, attention: out.some((l) => l.damaged > 0 || l.short > 0 || l.underReceived > 0) };
}

/** Received value at PO rates vs the supplier's invoice. Null when a rate or the invoice amount is missing. */
export function grnPriceVariance(lines: GrnAlertLineInput[], invoiceAmount: number | null | undefined): { receivedValue: number; invoiced: number; variance: number } | null {
  if (invoiceAmount === null || invoiceAmount === undefined) return null;
  if (!lines.every((l) => typeof l.ratePerUnit === 'number')) return null;
  const receivedValue = round2(lines.reduce((s, l) => s + l.received * (l.ratePerUnit as number), 0));
  return { receivedValue, invoiced: round2(invoiceAmount), variance: round2(invoiceAmount - receivedValue) };
}

/** One line for a home-screen row: "3 lines · 2 short · 1 damaged". */
export function grnAlertHeadline(p: Pick<GrnAlertPayload, 'lines' | 'totals'>): string {
  const parts = [`${p.lines.length} ${p.lines.length === 1 ? 'line' : 'lines'}`, `${p.totals.received} received of ${p.totals.ordered}`];
  if (p.totals.short > 0) parts.push(`${p.totals.short} short`);
  if (p.totals.damaged > 0) parts.push(`${p.totals.damaged} damaged`);
  return parts.join(' · ');
}
