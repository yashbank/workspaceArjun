import { describe, expect, it } from 'vitest';

import { PRICE_TOLERANCE_ABS, PRICE_TOLERANCE_PCT, QTY_TOLERANCE, amountExcludingGst, matchSupplierInvoice, sameInvoiceNo } from './invoice-match';

const line = (receivedQty: number, ratePerUnit: number, dcQuantity: number | null = null) => ({ receivedQty, ratePerUnit, dcQuantity });

describe('tolerances are named, not magic', () => {
  it('are the documented values', () => {
    expect(QTY_TOLERANCE).toBe(0.01);
    expect(PRICE_TOLERANCE_ABS).toBe(1);
    expect(PRICE_TOLERANCE_PCT).toBe(0.5);
  });
});

describe('matchSupplierInvoice', () => {
  it('exact match: invoice equals received value, challan agrees', () => {
    const r = matchSupplierInvoice([line(10, 731.19, 10)], 7311.9);
    expect(r.status).toBe('MATCHED');
    expect(r).toMatchObject({ qtyDiscrepancy: false, priceDiscrepancy: false, expectedAmount: 7311.9, priceVariance: 0 });
  });

  it('is Decimal-safe: 0.1 + 0.2 style sums do not drift', () => {
    const r = matchSupplierInvoice([line(0.1, 3), line(0.2, 3)], 0.9);
    expect(r.expectedAmount).toBe(0.9);
    expect(r.priceVariance).toBe(0);
    expect(r.receivedQty).toBe(0.3);
  });

  it('rounds the expected amount to 2dp (qty 2dp x rate 2dp is 4dp)', () => {
    // 3.33 x 1.11 = 3.6963 -> 3.70
    const r = matchSupplierInvoice([line(3.33, 1.11)], 3.7);
    expect(r.expectedAmount).toBe(3.7);
    expect(r.status).toBe('MATCHED');
  });

  it('over-billing beyond tolerance is a price discrepancy with a positive variance', () => {
    const r = matchSupplierInvoice([line(10, 100, 10)], 1100);
    expect(r.status).toBe('DISCREPANCY_PRICE');
    expect(r.priceVariance).toBe(100);
    expect(r.priceVariancePct).toBe(10);
  });

  it('under-billing beyond tolerance is a price discrepancy with a negative variance', () => {
    const r = matchSupplierInvoice([line(10, 100, 10)], 900);
    expect(r.status).toBe('DISCREPANCY_PRICE');
    expect(r.priceVariance).toBe(-100);
    expect(r.priceVariancePct).toBe(-10);
  });

  it('a variance inside the tolerance (max of Rs 1 and 0.5%) still matches', () => {
    expect(matchSupplierInvoice([line(1, 100, 1)], 100.99).status).toBe('MATCHED'); // under Rs 1
    expect(matchSupplierInvoice([line(1, 100, 1)], 101).status).toBe('MATCHED'); // exactly Rs 1: not over
    expect(matchSupplierInvoice([line(1, 100, 1)], 101.01).status).toBe('DISCREPANCY_PRICE');
    // 0.5% of 100000 is 500
    expect(matchSupplierInvoice([line(100, 1000, 100)], 100500).status).toBe('MATCHED');
    expect(matchSupplierInvoice([line(100, 1000, 100)], 100500.01).status).toBe('DISCREPANCY_PRICE');
  });

  it('short delivery against the challan is a qty discrepancy when the invoice follows the challan', () => {
    // challan and invoice say 10, only 9 accepted
    const r = matchSupplierInvoice([line(9, 100, 10)], 1000);
    expect(r.status).toBe('DISCREPANCY_QTY');
    expect(r).toMatchObject({ qtyDiscrepancy: true, priceDiscrepancy: false, billedQty: 10, receivedQty: 9, qtyVariance: 1 });
  });

  it('a qty difference of one hundredth is within QTY_TOLERANCE', () => {
    expect(matchSupplierInvoice([line(9.99, 100, 10)], 1000).status).toBe('MATCHED');
    expect(matchSupplierInvoice([line(9.98, 100, 10)], 1000).status).toBe('DISCREPANCY_QTY');
  });

  it('price outranks qty when both are wrong (red beats amber)', () => {
    const r = matchSupplierInvoice([line(9, 100, 10)], 1500);
    expect(r.status).toBe('DISCREPANCY_PRICE');
    expect(r.qtyDiscrepancy).toBe(true);
  });

  it('without a challan quantity the invoice is judged against what was received', () => {
    const r = matchSupplierInvoice([line(9, 100)], 1000);
    expect(r.status).toBe('DISCREPANCY_PRICE');
    expect(r.qtyDiscrepancy).toBe(false);
    expect(r.billedQty).toBeNull();
    expect(r.qtyVariance).toBeNull();
  });

  it('no invoice amount yet: pending review, but a qty discrepancy is still reported', () => {
    expect(matchSupplierInvoice([line(10, 100, 10)], null).status).toBe('PENDING_REVIEW');
    const r = matchSupplierInvoice([line(8, 100, 10)], null);
    expect(r.status).toBe('DISCREPANCY_QTY');
    expect(r.priceVariance).toBeNull();
    expect(r.priceVariancePct).toBeNull();
    expect(r.invoiceAmount).toBeNull();
  });

  it('no GRN lines at all: pending review', () => {
    expect(matchSupplierInvoice([], 500).status).toBe('PENDING_REVIEW');
  });

  it('zero quantity: pending when nothing is billed, price discrepancy when money is billed for nothing', () => {
    expect(matchSupplierInvoice([line(0, 100)], 0).status).toBe('PENDING_REVIEW');
    const r = matchSupplierInvoice([line(0, 100)], 250);
    expect(r.status).toBe('DISCREPANCY_PRICE');
    expect(r.priceVariancePct).toBeNull(); // no percentage of zero
  });

  it('nothing arrived against a challan that billed units is a qty discrepancy', () => {
    expect(matchSupplierInvoice([line(0, 100, 5)], null).status).toBe('DISCREPANCY_QTY');
  });

  it('sums several lines', () => {
    const r = matchSupplierInvoice([line(2, 50.5, 2), line(3, 10.25, 3)], 131.75);
    expect(r.expectedAmount).toBe(131.75);
    expect(r.status).toBe('MATCHED');
  });
});

describe('R2-335 invoice numbers match trimmed and case-insensitively', () => {
  it('treats casing and surrounding spaces as the same number', () => {
    expect(sameInvoiceNo('inv-9988 ', 'INV-9988')).toBe(true);
    expect(sameInvoiceNo(' INV-1', 'inv-1')).toBe(true);
    expect(sameInvoiceNo('INV-1', 'INV-2')).toBe(false);
    expect(sameInvoiceNo(null, '')).toBe(false);
    expect(sameInvoiceNo('  ', '')).toBe(false);
  });
});

describe('R2-325 GST on the invoice is excluded before the price comparison', () => {
  const lines10 = [line(1000, 100)]; // expected 1,00,000 ex-GST
  it('a tax invoice of 1,18,000 at 18% GST matches a 1,00,000 expectation', () => {
    const m = matchSupplierInvoice(lines10, 118000, 18);
    expect(m.status).toBe('MATCHED');
    expect(m.invoiceAmount).toBe(100000);
    expect(m.priceVariance).toBe(0);
  });
  it('without a GST % the same invoice is still a price discrepancy (unchanged), and 0% behaves as none', () => {
    expect(matchSupplierInvoice(lines10, 118000).status).toBe('DISCREPANCY_PRICE');
    expect(matchSupplierInvoice(lines10, 118000, 0).status).toBe('DISCREPANCY_PRICE');
    expect(matchSupplierInvoice(lines10, 100000, null).status).toBe('MATCHED');
  });
  it('amountExcludingGst rounds to paise', () => {
    expect(amountExcludingGst(118000, 18)).toBe(100000);
    expect(amountExcludingGst(1180, 18)).toBe(1000);
    expect(amountExcludingGst(1000, 5)).toBe(952.38);
    expect(amountExcludingGst(500, null)).toBe(500);
  });
});
