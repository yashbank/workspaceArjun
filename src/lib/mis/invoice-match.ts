/**
 * V2 Epic 1 — the status of one supplier invoice in the 3-way match (PO rate x GRN quantity vs the
 * billed amount).
 *
 * Pure: no Prisma, no React. All arithmetic is on integers (quantities in hundredths, money in
 * ten-thousandths of a rupee) so a sum of 2dp values never drifts, and results are rounded to 2dp.
 *
 * KEEP IN STEP with the backfill in
 * `prisma/migrations-pending/20261012000000_mis_supplier_invoice_status/migration.sql`, which
 * applies the same rule in SQL to rows that existed before the `status` column.
 *
 * The rule, per invoice (its GRN's lines, each at its PO line's rate):
 *   expected = sum of (challan qty if one was entered, else received qty) x rate
 *   PRICE    the invoice differs from `expected` by more than max(Rs 1, 0.5% of expected)
 *   QTY      any line's challan qty differs from its received qty by more than 0.01
 *   PENDING  nothing to compare (no GRN lines), no amount entered yet, or nothing billed/received
 *   MATCHED  otherwise
 * PRICE outranks QTY (red beats amber) when both hold; both flags are still returned.
 */

/** R2-335: 'inv-9988 ' on the GRN and 'INV-9988' on the invoice are the same number. */
export function sameInvoiceNo(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();
  return norm(a) !== '' && norm(a) === norm(b);
}

export const MATCH_STATUSES =['MATCHED', 'DISCREPANCY_QTY', 'DISCREPANCY_PRICE', 'PENDING_REVIEW'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Units a challan and a receipt may differ by before it is a quantity discrepancy (rounding guard). */
export const QTY_TOLERANCE = 0.01;
/** Rupees an invoice may differ from the expected amount by, whatever its size. */
export const PRICE_TOLERANCE_ABS = 1;
/** Percent of the expected amount an invoice may differ by; the larger of this and the Rs figure applies. */
export const PRICE_TOLERANCE_PCT = 0.5;

export type InvoiceMatchLine = {
  /** Good quantity accepted (damage excluded). */
  receivedQty: number;
  /** The PO line's rate per unit. */
  ratePerUnit: number;
  /** What the vendor's challan carried, when the store entered it. */
  dcQuantity?: number | null;
};

export type InvoiceMatchResult = {
  status: MatchStatus;
  qtyDiscrepancy: boolean;
  priceDiscrepancy: boolean;
  receivedQty: number;
  /** Sum of challan quantities; null when no line had one. */
  billedQty: number | null;
  /** billed - received over the lines that have a challan quantity (positive = short). Null without a challan. */
  qtyVariance: number | null;
  /** Rupees, 2dp: what the invoice should be for. */
  expectedAmount: number;
  invoiceAmount: number | null;
  /** invoice - expected, rupees 2dp. Positive = over-billed. Null without an invoice amount. */
  priceVariance: number | null;
  /** Variance as a percent of expected, 2dp. Null without an amount or when expected is zero. */
  priceVariancePct: number | null;
};

const toHundredths = (n: number) => Math.round(n * 100);
/** Rupees as ten-thousandths, so qty-hundredths x rate-hundredths is an exact integer. */
const toTenThousandths = (n: number) => Math.round(n * 100) * 100;
const hundredthsTo2dp = (u: number) => Math.round(u) / 100;
const tenThousandthsTo2dp = (u: number) => Math.round(u / 100) / 100;

export function matchSupplierInvoice(lines: readonly InvoiceMatchLine[], invoiceAmount: number | null | undefined): InvoiceMatchResult {
  let received = 0;
  let billed = 0;
  let billedReceived = 0;
  let anyChallan = false;
  let qtyDiscrepancy = false;
  let expected = 0; // ten-thousandths of a rupee
  for (const l of lines) {
    const rec = toHundredths(l.receivedQty);
    const rate = toHundredths(l.ratePerUnit);
    received += rec;
    const hasDc = l.dcQuantity !== null && l.dcQuantity !== undefined;
    const dc = hasDc ? toHundredths(l.dcQuantity as number) : rec;
    if (hasDc) {
      anyChallan = true;
      billed += dc;
      billedReceived += rec;
      if (Math.abs(dc - rec) > toHundredths(QTY_TOLERANCE)) qtyDiscrepancy = true;
    }
    expected += dc * rate;
  }

  const hasAmount = typeof invoiceAmount === 'number' && Number.isFinite(invoiceAmount);
  const invoiced = hasAmount ? toTenThousandths(invoiceAmount as number) : 0;
  const variance = invoiced - expected;
  const tolerance = Math.max(toTenThousandths(PRICE_TOLERANCE_ABS), Math.round((expected * PRICE_TOLERANCE_PCT) / 100));
  const priceDiscrepancy = lines.length > 0 && hasAmount && Math.abs(variance) > tolerance;

  let status: MatchStatus;
  if (lines.length === 0) status = 'PENDING_REVIEW';
  else if (priceDiscrepancy) status = 'DISCREPANCY_PRICE';
  else if (qtyDiscrepancy) status = 'DISCREPANCY_QTY';
  else if (!hasAmount || expected === 0) status = 'PENDING_REVIEW';
  else status = 'MATCHED';

  return {
    status,
    qtyDiscrepancy,
    priceDiscrepancy,
    receivedQty: hundredthsTo2dp(received),
    billedQty: anyChallan ? hundredthsTo2dp(billed) : null,
    qtyVariance: anyChallan ? hundredthsTo2dp(billed - billedReceived) : null,
    expectedAmount: tenThousandthsTo2dp(expected),
    invoiceAmount: hasAmount ? tenThousandthsTo2dp(invoiced) : null,
    priceVariance: hasAmount ? tenThousandthsTo2dp(variance) : null,
    priceVariancePct: hasAmount && expected !== 0 ? Math.round((variance / expected) * 10000) / 100 : null,
  };
}
