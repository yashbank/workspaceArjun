/**
 * V2 Epic 1 — the GRN's invoice amount is Owner-only in both directions, short qty is derived on the
 * server, and confirming a GRN with an invoice number writes the supplier-invoice leg of the match.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const state: { grn: Row; grnItems: Row[]; invoices: Row[]; audits: Row[] } = { grn: {}, grnItems: [], invoices: [], audits: [] };
const AMOUNT = 4321.09;

vi.mock('@/server/db', () => ({
  db: {
    misGrn: {
      findUnique: async () => state.grn,
      findMany: async () => [state.grn],
      update: async ({ data }: Row) => { Object.assign(state.grn, data); return state.grn; },
      create: async ({ data }: Row) => { state.grn = { id: 'g1', status: 'DRAFT', ...data }; return state.grn; },
    },
    misGrnItem: {
      create: async ({ data }: Row) => { const row = { id: `gi${state.grnItems.length}`, ...data }; state.grnItems.push(row); return row; },
      findUnique: async () => ({ ...state.grnItems[0], receivedQty: D(state.grnItems[0].receivedQty), dcQuantity: state.grnItems[0].dcQuantity == null ? null : D(state.grnItems[0].dcQuantity), damageQuantity: D(state.grnItems[0].damageQuantity) }),
      update: async ({ data }: Row) => { Object.assign(state.grnItems[0], data); return state.grnItems[0]; },
    },
    misSupplierInvoice: { upsert: async (args: Row) => { state.invoices.push(args); return args.create; } },
    misInventoryLedger: { findFirst: async () => null, create: async () => null },
    misPoItem: { update: async () => null },
    misAuditLog: { create: async ({ data }: Row) => { state.audits.push(JSON.parse(JSON.stringify(data))); return data; } },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb((await import('@/server/db')).db),
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { addGRNItem, confirmGRN, createGRN, getGRN, updateGRNHeader, updateGRNItem } = await import('./grn');

beforeEach(() => {
  vi.clearAllMocks();
  state.grn = { id: 'g1', grnNumber: 'GRN-1', poId: 'po1', status: 'DRAFT', supplierInvoiceNo: 'INV-7', invoiceDate: null, supplierInvoiceAmount: D(AMOUNT), po: { bomRef: null, supplierId: 's1', items: [] }, items: [] };
  state.grnItems = []; state.invoices = []; state.audits = [];
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('invoice amount is Owner-only', () => {
  it('a STORE_GUY writing an amount is refused on wages.read; the same patch without it is fine', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(updateGRNHeader('g1', { supplierInvoiceAmount: 10 })).rejects.toThrow(/wages.read/);
    await expect(updateGRNHeader('g1', { dcNumber: 'DC-1', supplierInvoiceNo: 'INV-8' })).resolves.toBeTruthy();
    expect(state.grn.dcNumber).toBe('DC-1');
  });

  it.each(['ADMIN', 'STORE_GUY', 'SUPERVISOR'] as const)('%s reads the GRN without the amount; the OWNER reads it with', async (role) => {
    getMisRole.mockResolvedValue(role);
    const grn = (await getGRN('g1')) as Row;
    expect(grn.supplierInvoiceNo).toBe('INV-7');
    expect('supplierInvoiceAmount' in grn).toBe(false);
    getMisRole.mockResolvedValue('OWNER');
    expect(((await getGRN('g1')) as Row).supplierInvoiceAmount.toNumber()).toBe(AMOUNT);
  });

  it('the amount never reaches an audit row', async () => {
    await createGRN({ poId: 'po1', supplierInvoiceAmount: AMOUNT, supplierInvoiceNo: 'INV-9' });
    await updateGRNHeader('g1', { supplierInvoiceAmount: 99 });
    expect(JSON.stringify(state.audits)).not.toContain(String(AMOUNT));
    expect(JSON.stringify(state.audits)).not.toContain('supplierInvoiceAmount');
  });
});

describe('short quantity', () => {
  it('is derived on add and re-derived on update; a challan over-accounted is refused', async () => {
    const line = await addGRNItem('g1', { poItemId: 'pi1', receivedQty: 90, dcQuantity: 100, damageQuantity: 4 });
    expect(line.shortQuantity).toBe(6);
    await updateGRNItem(line.id, { damageQuantity: 10 });
    expect(state.grnItems[0].shortQuantity).toBe(0);
    await expect(updateGRNItem(line.id, { damageQuantity: 11 })).rejects.toThrow(/more than the 100/);
  });
});

describe('confirm', () => {
  it('upserts the supplier invoice named on the header, keyed by PO + invoice number', async () => {
    await confirmGRN('g1');
    expect(state.invoices).toHaveLength(1);
    expect(state.invoices[0].where).toEqual({ poId_invoiceNo: { poId: 'po1', invoiceNo: 'INV-7' } });
    expect(state.invoices[0].create).toMatchObject({ grnId: 'g1', supplierId: 's1' });
  });
  it('writes no invoice when the header names none', async () => {
    state.grn.supplierInvoiceNo = null;
    await confirmGRN('g1');
    expect(state.invoices).toHaveLength(0);
  });
});
