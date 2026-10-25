/**
 * Task B review (R2 batch 2): a QC view-only reader of a PO / GRN sees the supplier's NAME, never their
 * contact, GST or payment terms (R2-37); `?page=` is capped (R2-83); a per-day leave read covers ranges (R2-101).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supplier = { id: 's1', code: 'SUP-1', name: 'Acme Board', phone: '9800000000', address: '1 Mill Rd', city: 'Pune', gstNo: '27ABCDE1234F1Z5', paymentTermsDays: 30 };
const poRow = { id: 'p1', poNumber: 'PO-1', supplier, items: [{ id: 'pi1', ratePerUnit: 12, item: { id: 'i1', name: 'Board', unit: 'KG' } }], grns: [] };
vi.mock('@/server/db', () => ({
  db: {
    misPurchaseOrder: { findUnique: async () => structuredClone(poRow) },
    misGrn: { findUnique: async () => ({ id: 'g1', grnNumber: 'GRN-1', items: [], po: structuredClone(poRow) }) },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getPO } = await import('./po');
const { getGRN } = await import('./grn');
const { pageQuery, parsePage, MAX_PAGE } = await import('@/lib/mis/pagination');
const { leaveCoversDayWhere } = await import('@/lib/mis/leave');

const as = (role: string) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };
beforeEach(() => vi.clearAllMocks());

describe('R2-37 — QC (po.view / grn.view) never receives supplier contact or tax data', () => {
  it('getPO for QC carries the supplier name only', async () => {
    as('QC');
    const po = await getPO('p1');
    expect(po?.supplier).toEqual({ id: 's1', code: 'SUP-1', name: 'Acme Board' });
    expect(JSON.stringify(po)).not.toMatch(/gst|phone|address|paymentTerms|ratePerUnit/i);
  });
  it('getGRN for QC carries the supplier name only', async () => {
    as('QC');
    const grn = await getGRN('g1');
    expect(grn?.po.supplier).toEqual({ id: 's1', code: 'SUP-1', name: 'Acme Board' });
    expect(JSON.stringify(grn)).not.toMatch(/gst|phone|address|paymentTerms/i);
  });
  it('a po.read holder (Store Guy) still sees the full supplier', async () => {
    as('STORE_GUY');
    const po = await getPO('p1');
    expect(po?.supplier).toMatchObject({ gstNo: supplier.gstNo, phone: supplier.phone });
  });
});

describe('R2-83 — page param is clamped', () => {
  it('caps an absurd page so the OFFSET stays bounded, and the size is never taken from the caller', () => {
    expect(parsePage('999999999999')).toBe(MAX_PAGE);
    expect(parsePage('-3')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(pageQuery('999999999999')).toMatchObject({ take: 10, skip: (MAX_PAGE - 1) * 10 });
  });
});

describe('R2-101 — a per-day leave read covers multi-day ranges', () => {
  it('matches a single-day leave on the day or a range that contains it', () => {
    const d = new Date('2026-10-21T00:00:00Z');
    expect(leaveCoversDayWhere(d)).toEqual({ date: { lte: d }, OR: [{ endDate: null, date: d }, { endDate: { gte: d } }] });
  });
});
