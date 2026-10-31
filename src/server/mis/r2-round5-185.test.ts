/**
 * R3-STK — GRN, receipt cap + 2% tolerance, PO status, number and sequence, invoice match, cart idempotency.
 * Real `createGRN` / `addGRNItem` / `confirmGRN` / `commitReceipt` on a stateful in-memory database. A throw
 * inside `$transaction` restores the snapshot (a rollback); `$queryRaw` records the advisory-lock keys.
 *
 *   B01 PO status after a GRN        B02 open-PO guard            B03 cap + 2% + ADMIN override (+ audit)
 *   B04 stale snapshot               B05 txn sequence lock        B06 GRN number (factory month, retry)
 *   B10 invoice across deliveries    B11 cart idempotency         B12 invoice-on-another-PO warning
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';


// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const n = (v: unknown): number => (v == null ? 0 : typeof v === 'number' ? v : (v as { toNumber(): number }).toNumber());
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const state: {
  pos: Row[]; poItems: Row[]; grns: Row[]; grnItems: Row[]; ledger: Row[]; txns: Row[]; invoices: Row[]; audits: Row[];
  events: string[]; lockCalls: string[][]; stamp: number; grnCreateAttempts: string[]; failGrnNumbers: number; keyed: Map<string, unknown>;
} = {
  pos: [], poItems: [], grns: [], grnItems: [], ledger: [], txns: [], invoices: [], audits: [],
  events: [], lockCalls: [], stamp: 0, grnCreateAttempts: [], failGrnNumbers: 0, keyed: new Map(),
};
const kraft = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG', category: 'RAW_MATERIAL', isActive: true, deletedAt: null };
const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++state.stamp);

const grnView = (g: Row): Row => ({
  ...g,
  po: {
    ...state.pos.find((p) => p.id === g.poId),
    items: state.poItems.filter((p) => p.poId === g.poId).map((p) => ({
      id: p.id, description: p.description, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity), item: { name: kraft.name, unit: kraft.unit },
    })),
  },
  supplierInvoiceAmount: g.supplierInvoiceAmount == null ? null : D(g.supplierInvoiceAmount),
  items: state.grnItems.filter((i) => i.grnId === g.id).map((i) => ({
    ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity ?? 0), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity),
    poItem: { ...state.poItems.find((p) => p.id === i.poItemId), ratePerUnit: D(state.poItems.find((p) => p.id === i.poItemId)!.ratePerUnit), item: kraft },
  })),
});

const match = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'startsWith' in v) return String(row[k]).startsWith(v.startsWith);
    if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
    return row[k] === v;
  });

const db: Row = {
  misItem: { findMany: async ({ where }: Row) => [kraft].filter((i) => where.id.in.includes(i.id)), update: async () => null },
  misPurchaseOrder: {
    findUnique: async ({ where, include }: Row) => {
      const po = state.pos.find((p) => p.id === where.id);
      if (!po) return null;
      return include?.items ? { ...po, items: state.poItems.filter((i) => i.poId === po.id).map((i) => ({ id: i.id, itemId: i.itemId })) } : { ...po };
    },
    update: async ({ where, data }: Row) => { Object.assign(state.pos.find((p) => p.id === where.id)!, data); return null; },
    // The PO row lock: matches only while the PO is open for goods.
    updateMany: async ({ where }: Row) => { state.events.push('po-lock'); return { count: state.pos.filter((p) => p.id === where.id && where.status.in.includes(p.status)).length }; },
  },
  misPoItem: {
    findMany: async ({ where }: Row) => (state.events.push('po-lines'), state.poItems)
      .filter((p) => (where.poId ? p.poId === where.poId : where.id.in.includes(p.id)))
      .map((p) => ({ ...p, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity), ratePerUnit: D(p.ratePerUnit) })),
    update: async ({ where, data }: Row) => { const p = state.poItems.find((x) => x.id === where.id)!; p.receivedQuantity = Math.round((p.receivedQuantity + n(data.receivedQuantity.increment)) * 100) / 100; return p; },
  },
  misGrn: {
    create: async ({ data }: Row) => {
      state.grnCreateAttempts.push(data.grnNumber);
      if (state.failGrnNumbers > 0) { state.failGrnNumbers -= 1; throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: ['grn_number'] } }); }
      const row = { id: `g${state.grns.length + 1}`, status: 'DRAFT', dcNumber: 'DC-1', supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null, ...data };
      state.grns.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: Row) => { const g = state.grns.find((x) => (where.id ? x.id === where.id : x.grnNumber === where.grnNumber)); return g ? grnView(g) : null; },
    findMany: async ({ where }: Row) => state.grns.filter((g) => match(g, where)).map((g) => ({ ...grnView(g) })),
    updateMany: async ({ where, data }: Row) => {
      const g = state.grns.find((x) => x.id === where.id && (!where.status || x.status === where.status));
      if (g) Object.assign(g, data);
      return { count: g ? 1 : 0 };
    },
  },
  misGrnItem: {
    create: async ({ data }: Row) => { const row = { id: `gi${state.grnItems.length + 1}`, ...data }; state.grnItems.push(row); return row; },
    findUnique: async ({ where }: Row) => { const i = state.grnItems.find((x) => x.id === where.id); return i ? { ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity ?? 0), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity) } : null; },
    update: async ({ where, data }: Row) => { const i = state.grnItems.find((x) => x.id === where.id)!; Object.assign(i, data); return i; },
  },
  misInventoryLedger: {
    findFirst: async ({ where }: Row) => { const rows = state.ledger.filter((l) => l.itemId === where.itemId); const last = rows.at(-1); return last ? { balanceQty: D(last.balanceQty) } : null; },
    create: async ({ data }: Row) => { const row = { id: `l${state.ledger.length + 1}`, createdAt: stamp(), ...data, changeQty: n(data.changeQty) }; state.ledger.push(row); return row; },
  },
  misStoreTransaction: {
    findFirst: async ({ where }: Row) => {
      const rows = state.txns.filter((t) => match(t, where));
      const last = rows.at(-1);
      return last ? { txnNumber: last.txnNumber, balanceQty: D(last.balanceQty) } : null;
    },
    create: async ({ data }: Row) => { const row = { id: `t${state.txns.length + 1}`, createdAt: stamp(), ...data, quantity: n(data.quantity) }; state.txns.push(row); return row; },
  },
  misSupplierInvoice: {
    upsert: async (args: Row) => { state.invoices.push(args); return null; },
    findFirst: async ({ where }: Row) => {
      const hit = state.invoices.find((i) => i.create.supplierId === where.supplierId && i.create.invoiceNo === where.invoiceNo && i.create.poId !== where.poId.not);
      return hit ? { po: { poNumber: state.pos.find((p) => p.id === hit.create.poId)?.poNumber } } : null;
    },
  },
  misOrder: { findFirst: async () => null },
  misOrderStockAllocation: { create: async () => null },
  misQuarantineStock: { create: async ({ data }: Row) => ({ id: 'q1', ...data }) }, // R2-278: damaged quantity is quarantined on confirm (fixture delegate)
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const snapshot = clone({ pos: state.pos, poItems: state.poItems, grns: state.grns, grnItems: state.grnItems, ledger: state.ledger, txns: state.txns, invoices: state.invoices });
    const tx: Row = { ...db, $queryRaw: async (_s: TemplateStringsArray, key: string) => { state.lockCalls.at(-1)?.push(key); return [{ locked: 1 }]; } };
    try { return await cb(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./grn-alerts', () => ({ notifyGrnConfirmed: async () => undefined }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(clone(e)); } }));
const lockSpy = vi.fn();
vi.mock('./stock-lock', () => ({
  lockStockKeys: async (tx: Row, keys: string[]) => { lockSpy([...keys]); state.lockCalls.push([]); await tx.$queryRaw`x${[...new Set(keys)].sort()[0] ?? ''}`; },
}));
// The shared idempotency table, in memory: first call applies in a transaction, a repeat answers with the stored result.
vi.mock('./idempotency', () => ({
  runIdempotent: async (envelope: { key: string }, apply: (tx: Row) => Promise<{ result: unknown }>) => {
    if (state.keyed.has(envelope.key)) return { outcome: 'DUPLICATE', result: state.keyed.get(envelope.key) };
    try {
      const out = await db.$transaction((tx: Row) => apply(tx));
      state.keyed.set(envelope.key, (out as { result: unknown }).result);
      return { outcome: 'APPLIED', result: (out as { result: unknown }).result };
    } catch (error) {
      return { outcome: 'RETRY', detail: (error as Error).message };
    }
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { confirmGRN } = await import('./grn');

const grnRow = (id: string, over: Row = {}): Row => ({ id, grnNumber: id.toUpperCase(), poId: 'po1', status: 'DRAFT', dcNumber: 'DC-1', supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null, ...over });
const line = (grnId: string, poItemId: string, receivedQty: number, over: Row = {}): Row => ({ id: `${grnId}-${poItemId}-${state.grnItems.length}`, grnId, poItemId, receivedQty, damageQuantity: 0, dcQuantity: null, type: 'GENERAL', forOrderRef: null, ...over });
const as = (role: string) => getMisRole.mockResolvedValue(role);
const poStatus = (id = 'po1') => state.pos.find((p) => p.id === id)!.status;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    pos: [{ id: 'po1', poNumber: 'PO-1', status: 'APPROVED', bomRef: null, supplierId: 's1' }, { id: 'po2', poNumber: 'PO-2', status: 'APPROVED', bomRef: null, supplierId: 's1' }],
    poItems: [
      { id: 'pi1', poId: 'po1', itemId: 'i1', description: 'Kraft 120gsm', quantity: 100, receivedQuantity: 0, ratePerUnit: 10 },
      { id: 'pi2', poId: 'po1', itemId: 'i1', description: 'Kraft 140gsm', quantity: 100, receivedQuantity: 0, ratePerUnit: 10 },
    ],
    grns: [grnRow('g1'), grnRow('g2')], grnItems: [], ledger: [{ id: 'l0', itemId: 'i1', changeQty: 0, balanceQty: 0, source: 'OPENING', createdAt: stamp() }],
    txns: [], invoices: [], audits: [], events: [], lockCalls: [], stamp: 0, grnCreateAttempts: [], failGrnNumbers: 0, keyed: new Map(),
  });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  as('STORE_GUY');
});

describe('R2-185', () => {
  it('R2-185: a delivery that arrived 100% damaged books nothing but moves the PO off APPROVED to RECEIVING', async () => {
    state.grnItems = [line('g1', 'pi1', 0, { damageQuantity: 10, dcQuantity: 10 })];
    await confirmGRN('g1');
    expect(state.grns[0].status).toBe('CONFIRMED');
    expect(state.ledger).toHaveLength(1);
    expect(poStatus()).toBe('RECEIVING');
  });
});
