import { describe, expect, it } from 'vitest';

import { shortQuantity, threeWayMatch, withoutInvoiceMoney } from './grn-match';

describe('shortQuantity', () => {
  it('is dc − (received + damage), null without a DC qty, and refuses an over-accounted challan', () => {
    expect(shortQuantity(100, 90, 4)).toBe(6);
    expect(shortQuantity(100, 100, 0)).toBe(0);
    expect(shortQuantity(null, 90, 4)).toBeNull();
    expect(() => shortQuantity(100, 98, 3)).toThrow(/more than the 100/);
    expect(() => shortQuantity(100, -1, 0)).toThrow(/negative/);
  });
});

describe('withoutInvoiceMoney', () => {
  it('removes the two invoice money keys at any depth, nothing else', () => {
    const out = withoutInvoiceMoney({ id: 'g', supplierInvoiceAmount: 5, supplierInvoices: [{ invoiceNo: 'A', invoiceAmount: 9 }] });
    expect(out).toEqual({ id: 'g', supplierInvoices: [{ invoiceNo: 'A' }] });
  });
});

describe('threeWayMatch', () => {
  const po = [{ id: 'p1', description: 'Kraft', quantity: 100, ratePerUnit: 10 }, { id: 'p2', description: 'Ink', quantity: 5, ratePerUnit: 200 }];
  const grn = [
    { poItemId: 'p1', receivedQty: 60, damageQuantity: 2, shortQuantity: 3, confirmed: true },
    { poItemId: 'p1', receivedQty: 30, damageQuantity: 0, shortQuantity: null, confirmed: false }, // draft: not received
    { poItemId: 'p2', receivedQty: 5, damageQuantity: 0, shortQuantity: 0, confirmed: true },
  ];
  it('sums confirmed receipts per PO line and leaves drafts out', () => {
    const m = threeWayMatch(po, grn, [{ invoiceNo: 'INV-1', invoiceAmount: 1700 }]);
    expect(m.lines[0]).toMatchObject({ ordered: 100, received: 60, damaged: 2, short: 3, outstanding: 40 });
    expect(m.totals).toEqual({ ordered: 105, received: 65, damaged: 2, short: 3, outstanding: 40 });
    expect(m.invoiceCount).toBe(1);
  });
  it('money: PO value, received value and invoice variance — only when every line is priced', () => {
    const m = threeWayMatch(po, grn, [{ invoiceNo: 'INV-1', invoiceAmount: 1700 }]);
    expect(m.money).toEqual({ poValue: 2000, receivedValue: 1600, invoiced: 1700, variance: 100 });
    const stripped = threeWayMatch(po.map(({ ratePerUnit: _r, ...p }) => p), grn, []);
    expect(stripped.money).toBeUndefined();
  });
});
