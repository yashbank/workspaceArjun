/**
 * V2 Epic 2 — stock received FOR an order is earmarked for it, and an issue against the order can
 * never exceed (allocated − already issued). Exercised through the real `commitIssue` and
 * `confirmGRN` on an in-memory database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const ORDER = { id: 'o1', orderNumber: 'ORD-202610-00001' };
const state: { ledger: Row[]; txns: Row[]; allocations: Row[]; grn: Row | null; poItemIncrements: { toNumber(): number }[] } = {
  ledger: [], txns: [], allocations: [], grn: null, poItemIncrements: [],
};
const item = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG', isActive: true, deletedAt: null };

const db: Row = {
  misItem: { findMany: async () => [item] },
  misOrder: {
    findUnique: async () => ORDER,
    findFirst: async ({ where }: Row) => (where.orderNumber === ORDER.orderNumber ? { id: ORDER.id } : null),
  },
  misDepartment: { findUnique: async () => null },
  misOrderStockAllocation: {
    create: async ({ data }: Row) => { state.allocations.push(data); return data; },
    findMany: async ({ where }: Row) => state.allocations.filter((a) => a.orderId === where.orderId).map((a) => ({ itemId: a.itemId, allocatedQty: D(a.allocatedQty) })),
  },
  misInventoryLedger: {
    create: async ({ data }: Row) => { state.ledger.push({ createdAt: new Date(), ...data }); return data; },
    findFirst: async () => ({ balanceQty: D(1000) }),
    findMany: async ({ where }: Row) =>
      state.ledger.filter((l) => l.source === where.source && l.sourceId === where.sourceId).map((l) => ({ itemId: l.itemId, changeQty: D(l.changeQty) })),
  },
  misStoreTransaction: {
    create: async ({ data }: Row) => { state.txns.push(data); return data; },
    findFirst: async () => null,
  },
  misGrn: { findUnique: async () => state.grn, update: async () => null },
  misPoItem: { update: async ({ data }: Row) => { state.poItemIncrements.push(data.receivedQuantity.increment); } },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb(db),
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./audit', () => ({ logAuditEvent: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { commitIssue } = await import('./store');
const { confirmGRN } = await import('./grn');

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { ledger: [], txns: [], allocations: [], grn: null, poItemIncrements: [] });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

const grnWith = (lines: Row[], bomRef: string | null = null) => ({
  id: 'g1', grnNumber: 'GRN-1', status: 'DRAFT', po: { bomRef },
  items: lines.map((l, i) => ({ id: `gl${i}`, poItemId: `pi${i}`, receivedQty: D(l.qty), type: l.type ?? 'GENERAL', forOrderRef: l.ref ?? null, poItem: { itemId: 'i1', item } })),
});

describe('confirmGRN earmarks', () => {
  it('a FOR_ORDER line whose ref is an order number', async () => {
    state.grn = grnWith([{ qty: 100, type: 'FOR_ORDER', ref: 'ord-202610-00001' }]);
    await confirmGRN('g1');
    expect(state.allocations).toEqual([{ orderId: 'o1', itemId: 'i1', allocatedQty: 100, source: 'GRN', sourceId: 'g1' }]);
    expect(state.ledger[0].changeQty.toNumber()).toBe(100); // general ledger still receives it
  });

  it("a FOR_ORDER line with no ref of its own falls back to the PO's BOM ref", async () => {
    state.grn = grnWith([{ qty: 30, type: 'FOR_ORDER' }], 'ORD-202610-00001');
    await confirmGRN('g1');
    expect(state.allocations).toHaveLength(1);
  });

  it('a GENERAL line, or a ref that is not an order number, earmarks nothing', async () => {
    state.grn = grnWith([{ qty: 10 }, { qty: 5, type: 'FOR_ORDER', ref: 'BOM-500' }, { qty: 5, type: 'FOR_ORDER', ref: 'ORD-202610-99999' }]);
    await confirmGRN('g1');
    expect(state.allocations).toEqual([]);
    expect(state.poItemIncrements.map((d) => d.toNumber())).toEqual([10, 5, 5]);
  });
});

describe('commitIssue against an order', () => {
  const allocate = (qty: number) => state.allocations.push({ orderId: 'o1', itemId: 'i1', allocatedQty: qty, source: 'GRN', sourceId: 'g1' });

  it('allows up to exactly the remaining allocation across several issues', async () => {
    allocate(100);
    await commitIssue([{ itemId: 'i1', qty: 40 }], { orderId: 'o1' });
    await commitIssue([{ itemId: 'i1', qty: 60 }], { orderId: 'o1' });
    expect(state.ledger.map((l) => l.changeQty)).toEqual([-40, -60]);
  });

  it('refuses the whole cart when (issued + requested) would pass the allocation, writing nothing', async () => {
    allocate(100);
    await commitIssue([{ itemId: 'i1', qty: 40 }], { orderId: 'o1' });
    await expect(commitIssue([{ itemId: 'i1', qty: 60.01 }], { orderId: 'o1' })).rejects.toThrow(/only 60 of the 100 allocated/);
    expect(state.ledger).toHaveLength(1);
    expect(state.txns).toHaveLength(1);
  });

  it('an item never earmarked for the order still issues from general stock (no lock-out)', async () => {
    await commitIssue([{ itemId: 'i1', qty: 5 }], { orderId: 'o1' });
    expect(state.ledger).toHaveLength(1);
  });

  it('a general issue (no order) is never capped by anyone\'s allocation', async () => {
    allocate(1);
    await commitIssue([{ itemId: 'i1', qty: 500 }], {});
    expect(state.ledger).toHaveLength(1);
  });
});
