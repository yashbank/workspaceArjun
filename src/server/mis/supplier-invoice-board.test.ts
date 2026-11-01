/**
 * F6 — the reconciliation board: Store Guy sees status only, Admin adds quantities and a variance %,
 * only the Owner sees rupees; reconcile persists the recomputed status and audits status only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const D = (n: number) => ({ toNumber: () => n });
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  invoiceNo: 'INV-1',
  invoiceDate: null,
  invoiceAmount: D(1100),
  status: 'PENDING_REVIEW',
  po: { poNumber: 'PO-1' },
  supplier: { name: 'Acme Paper' },
  grn: { grnNumber: 'GRN-1', items: [{ receivedQty: D(10), dcQuantity: D(10), poItem: { ratePerUnit: D(100) } }] },
  ...over,
});

const findMany = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@/server/db', () => ({ db: { misSupplierInvoice: { findMany: (...a: unknown[]) => findMany(...a), findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));
const logAuditEvent = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => logAuditEvent(...a) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listSupplierInvoices, reconcileSupplierInvoice, signOffInvoiceVariance } = await import('./supplier-invoice');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  findMany.mockResolvedValue([invoice()]);
});

describe('listSupplierInvoices', () => {
  it('Store Guy: status and identifiers only, no figures, no rupees', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    const [row] = await listSupplierInvoices();
    expect(row).toMatchObject({ invoiceNo: 'INV-1', poNumber: 'PO-1', status: 'PENDING_REVIEW' });
    expect('figures' in row).toBe(false);
    expect('money' in row).toBe(false);
    expect(JSON.stringify(row)).not.toMatch(/1100|1000|100\b/);
  });

  it('Admin: quantities and variance %, but no rupee anywhere', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const [row] = await listSupplierInvoices();
    expect(row.figures).toEqual({ billedQty: 10, receivedQty: 10, qtyVariance: 0, variancePct: 10 });
    expect('money' in row).toBe(false);
    expect(JSON.stringify(row)).not.toMatch(/₹|1100|1000/);
  });

  it('Owner: also gets formatted rupees', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const [row] = await listSupplierInvoices();
    expect(row.money).toEqual({ expected: '₹1,000.00', invoiced: '₹1,100.00', variance: '₹100.00' });
  });

  it.each(['QC', 'SUPERVISOR'] as const)('%s is refused', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(listSupplierInvoices()).rejects.toThrow(/Not permitted/);
  });

  it('passes a status filter to the query', async () => {
    getMisRole.mockResolvedValue('OWNER');
    await listSupplierInvoices({ status: 'MATCHED' });
    expect(findMany.mock.calls[0][0].where).toEqual({ status: 'MATCHED' });
  });
});

describe('reconcileSupplierInvoice', () => {
  it('stores the recomputed status and audits the status only', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    findUnique.mockResolvedValue(invoice());
    const r = await reconcileSupplierInvoice('inv1');
    expect(r).toEqual({ id: 'inv1', status: 'DISCREPANCY_PRICE', changed: true });
    // R2-280: a changed match also clears any earlier Owner sign-off.
    expect(update).toHaveBeenCalledWith({ where: { id: 'inv1' }, data: { status: 'DISCREPANCY_PRICE', varianceSignedOffById: null, varianceSignedOffAt: null, varianceSignOffNote: null } });
    const audit = logAuditEvent.mock.calls[0][0];
    expect(audit.before).toEqual({ status: 'PENDING_REVIEW' });
    expect(audit.after).toEqual({ status: 'DISCREPANCY_PRICE' });
  });

  it('does nothing when the status is already right', async () => {
    getMisRole.mockResolvedValue('OWNER');
    findUnique.mockResolvedValue(invoice({ status: 'DISCREPANCY_PRICE' }));
    expect((await reconcileSupplierInvoice('inv1')).changed).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('Store Guy may read the board but not reconcile', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(reconcileSupplierInvoice('inv1')).rejects.toThrow(/Not permitted/);
  });
});

describe('R2-280 variance sign-off', () => {
  it('the Owner signs off a discrepancy invoice with a note; audited without any figure', async () => {
    getMisRole.mockResolvedValue('OWNER');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'DISCREPANCY_PRICE', varianceSignedOffAt: null });
    const out = await signOffInvoiceVariance('inv1', '  Agreed with the vendor, freight added  ');
    expect(out.signedOff?.note).toBe('Agreed with the vendor, freight added');
    expect(update.mock.calls[0][0].data).toMatchObject({ varianceSignedOffById: 'u1', varianceSignOffNote: 'Agreed with the vendor, freight added' });
    const audit = logAuditEvent.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'supplier_invoice.sign_off_variance', after: { signedOff: true } });
    expect(JSON.stringify(audit)).not.toMatch(/1100|100|₹/);
  });

  it('an Admin cannot sign off; a MATCHED invoice needs none; a second sign-off is refused', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(signOffInvoiceVariance('inv1')).rejects.toThrow(/Not permitted/);
    getMisRole.mockResolvedValue('OWNER');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'MATCHED', varianceSignedOffAt: null });
    await expect(signOffInvoiceVariance('inv1')).rejects.toThrow(/Only an invoice with a quantity or price discrepancy/);
    findUnique.mockResolvedValue({ id: 'inv1', status: 'DISCREPANCY_QTY', varianceSignedOffAt: new Date() });
    await expect(signOffInvoiceVariance('inv1')).rejects.toThrow(/already signed off/);
  });

  it('the board carries the sign-off to every reader, and a re-check that changes the status clears it', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    findMany.mockResolvedValue([invoice({ status: 'DISCREPANCY_PRICE', varianceSignedOffAt: new Date('2026-10-30T00:00:00Z'), varianceSignOffNote: 'ok' })]);
    const [row] = await listSupplierInvoices();
    expect(row.signedOff).toEqual({ at: new Date('2026-10-30T00:00:00Z'), note: 'ok' });
    getMisRole.mockResolvedValue('ADMIN');
    findUnique.mockResolvedValue(invoice({ status: 'DISCREPANCY_PRICE' })); // the GRN says 10 x 100 = 1000 vs 1100 -> price discrepancy stays
    expect((await reconcileSupplierInvoice('inv1')).changed).toBe(false);
    findUnique.mockResolvedValue(invoice({ status: 'MATCHED' })); // stored MATCHED, recomputed DISCREPANCY -> changed, sign-off cleared
    expect((await reconcileSupplierInvoice('inv1')).changed).toBe(true);
    expect(update.mock.calls.at(-1)![0].data).toMatchObject({ varianceSignedOffAt: null, varianceSignedOffById: null, varianceSignOffNote: null });
  });
});

const { approveInvoiceForPayment, markInvoicePaid, rejectSupplierInvoice } = await import('./supplier-invoice');

describe('R2-288 payment states', () => {
  it('the Owner approves a MATCHED invoice for payment; audited by status only', async () => {
    getMisRole.mockResolvedValue('OWNER');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'MATCHED', varianceSignedOffAt: null });
    await expect(approveInvoiceForPayment('inv1')).resolves.toMatchObject({ status: 'APPROVED_FOR_PAYMENT' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'inv1' }, data: expect.objectContaining({ status: 'APPROVED_FOR_PAYMENT', paymentApprovedById: 'u1' }) });
    expect(JSON.stringify(logAuditEvent.mock.calls.at(-1))).not.toMatch(/1100|amount/i);
  });
  it('a discrepancy needs the sign-off first; a pending-review invoice is refused; Admin may not approve', async () => {
    getMisRole.mockResolvedValue('OWNER');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'DISCREPANCY_PRICE', varianceSignedOffAt: null });
    await expect(approveInvoiceForPayment('inv1')).rejects.toThrow(/Sign off the variance/);
    findUnique.mockResolvedValue({ id: 'inv1', status: 'DISCREPANCY_PRICE', varianceSignedOffAt: new Date() });
    await expect(approveInvoiceForPayment('inv1')).resolves.toMatchObject({ status: 'APPROVED_FOR_PAYMENT' });
    findUnique.mockResolvedValue({ id: 'inv1', status: 'PENDING_REVIEW', varianceSignedOffAt: null });
    await expect(approveInvoiceForPayment('inv1')).rejects.toThrow(/not been matched/);
    getMisRole.mockResolvedValue('ADMIN');
    await expect(approveInvoiceForPayment('inv1')).rejects.toThrow(/Not permitted: wages\.read/);
  });
  it('Admin marks an approved invoice paid with a date and a UTR; both are required', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'APPROVED_FOR_PAYMENT' });
    await expect(markInvoicePaid('inv1', { paymentDate: '2026-11-01', paymentRef: '' })).rejects.toThrow(/UTR/);
    await expect(markInvoicePaid('inv1', { paymentDate: 'yesterday', paymentRef: 'UTR123' })).rejects.toThrow(/payment date/);
    await expect(markInvoicePaid('inv1', { paymentDate: '2026-11-01', paymentRef: 'UTR123' })).resolves.toMatchObject({ status: 'PAID' });
    expect(update).toHaveBeenLastCalledWith({ where: { id: 'inv1' }, data: expect.objectContaining({ status: 'PAID', paymentRef: 'UTR123', paidById: 'u1' }) });
    findUnique.mockResolvedValue({ id: 'inv1', status: 'MATCHED' });
    await expect(markInvoicePaid('inv1', { paymentDate: '2026-11-01', paymentRef: 'UTR123' })).rejects.toThrow(/approved for payment/);
  });
  it('reject needs a reason and never applies to a paid invoice; a settled invoice is not re-matched', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    findUnique.mockResolvedValue({ id: 'inv1', status: 'MATCHED' });
    await expect(rejectSupplierInvoice('inv1', ' ')).rejects.toThrow(/reason/);
    await expect(rejectSupplierInvoice('inv1', 'duplicate of INV-0')).resolves.toMatchObject({ status: 'REJECTED' });
    findUnique.mockResolvedValue({ id: 'inv1', status: 'PAID' });
    await expect(rejectSupplierInvoice('inv1', 'oops')).rejects.toThrow(/paid invoice/);
    findUnique.mockResolvedValue(invoice({ status: 'PAID' }));
    await expect(reconcileSupplierInvoice('inv1')).rejects.toThrow(/no longer re-checked/);
  });
});
