import { describe, expect, it } from 'vitest';

import {
  RECEIPT_TOLERANCE,
  isReceivablePoStatus,
  maxReceivable,
  overCeilingMessage,
  overReceiptMessage,
  poNotReceivableMessage,
  poStatusAfterReceipt,
  receiptVerdict,
} from './receipt-rules';

const D = (n: number) => ({ toNumber: () => n });

describe('R3-STK B03 maxReceivable / receiptVerdict', () => {
  it('is ordered + 2%, rounded to 2 dp', () => {
    expect(RECEIPT_TOLERANCE).toBe(0.02);
    expect(maxReceivable(100)).toBe(102);
    expect(maxReceivable(33)).toBe(33.66);
  });

  it('102 of 100 is within tolerance for anyone; 102.01 is refused for a Store Guy', () => {
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 102, role: 'STORE_GUY' }).kind).toBe('OK');
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 102.01, role: 'STORE_GUY' }).kind).toBe('REFUSED');
  });

  it('counts what confirmed GRNs and the rest of this GRN already took', () => {
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 60, alreadyOnThisGrn: 30, qty: 12, role: 'STORE_GUY' }).kind).toBe('OK');
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 60, alreadyOnThisGrn: 30, qty: 12.01, role: 'STORE_GUY' }).kind).toBe('REFUSED');
  });

  it('beyond tolerance, ADMIN/OWNER need a reason of 3+ trimmed characters', () => {
    const base = { ordered: 100, receivedSoFar: 0, qty: 102.01 } as const;
    for (const role of ['ADMIN', 'OWNER'] as const) {
      expect(receiptVerdict({ ...base, role }).kind).toBe('REFUSED');
      expect(receiptVerdict({ ...base, role, overReceiptReason: 'ok' }).kind).toBe('REFUSED');
      expect(receiptVerdict({ ...base, role, overReceiptReason: '  ok  ' }).kind).toBe('REFUSED');
      expect(receiptVerdict({ ...base, role, overReceiptReason: ' short delivery note ' })).toMatchObject({ kind: 'OVERRIDE', reason: 'short delivery note' });
    }
  });

  // R2-279: past ordered + 5% an Admin's reason is not enough; only the Owner may accept it.
  it('R2-279: between 2% and 5% an Admin overrides with a reason; past 5% only the Owner can, and the refusal says so', () => {
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 105, role: 'ADMIN', overReceiptReason: 'supplier over-shipped' }).kind).toBe('OVERRIDE');
    const admin = receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 105.01, role: 'ADMIN', overReceiptReason: 'supplier over-shipped' });
    expect(admin).toMatchObject({ kind: 'REFUSED', beyondCeiling: true, ceiling: 105 });
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 10000, role: 'OWNER' }).kind).toBe('REFUSED');
    expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 10000, role: 'OWNER', overReceiptReason: 'bulk deal, confirmed by phone' }).kind).toBe('OVERRIDE');
    expect(overCeilingMessage('Kraft', 105, 'KG', false)).toMatch(/more than 5% \(ceiling 105 KG\)\. Only the Owner can accept this much/);
    expect(overCeilingMessage('Kraft', 105, 'KG', true)).toMatch(/Give a reason/);
  });

  it('no other role can override, whatever the reason', () => {
    for (const role of ['STORE_GUY', 'SUPERVISOR', 'QC'] as const) {
      expect(receiptVerdict({ ordered: 100, receivedSoFar: 0, qty: 150, role, overReceiptReason: 'a very good reason' }).kind).toBe('REFUSED');
    }
  });

  it('words the refusal for the role', () => {
    expect(overReceiptMessage('Kraft', 102, 'KG')).toBe('Kraft exceeds the order by more than 2% (max 102 KG). Ask an Admin to override.');
    expect(overReceiptMessage('Kraft', 102, 'KG', true)).toMatch(/Give a reason/);
  });
});

describe('R3-STK B02 receivable statuses', () => {
  it.each(['APPROVED', 'RECEIVING', 'PARTIAL'])('%s is open', (s) => expect(isReceivablePoStatus(s)).toBe(true));
  it.each(['DRAFT', 'PENDING_APPROVAL', 'CANCELLED', 'COMPLETE', '', null, undefined])('%s is not', (s) => expect(isReceivablePoStatus(s)).toBe(false));
  it('names the PO and its status', () => {
    expect(poNotReceivableMessage('PO-1', 'DRAFT')).toBe('PO PO-1 is DRAFT; goods can only be received against an approved PO.');
  });
});

describe('R3-STK B01 poStatusAfterReceipt', () => {
  it('COMPLETE when every line is fully received', () => {
    expect(poStatusAfterReceipt([{ quantity: 100, receivedQuantity: 100 }, { quantity: D(50), receivedQuantity: D(51) }])).toBe('COMPLETE');
  });
  it('PARTIAL when something arrived but not everything', () => {
    expect(poStatusAfterReceipt([{ quantity: 100, receivedQuantity: 40 }])).toBe('PARTIAL');
    expect(poStatusAfterReceipt([{ quantity: 100, receivedQuantity: 100 }, { quantity: 50, receivedQuantity: 0 }])).toBe('PARTIAL');
  });
  it('null (leave unchanged) with no lines or nothing received', () => {
    expect(poStatusAfterReceipt([])).toBeNull();
    expect(poStatusAfterReceipt([{ quantity: 100, receivedQuantity: 0 }])).toBeNull();
  });
});
