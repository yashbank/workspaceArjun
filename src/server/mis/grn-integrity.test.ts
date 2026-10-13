/**
 * F2 — GRN integrity, through the real `confirmGRN` / `addGRNItem` / `updateGRNItem` on a stateful
 * in-memory database whose reads yield, so two concurrent confirms genuinely interleave (the way
 * idempotency.test.ts makes its race). `$queryRaw` stands in for the advisory lock; a thrown error
 * inside `$transaction` restores the snapshot, as a rollback would.
 *
 *   A. two concurrent confirms credit the ledger and the PO line exactly once
 *   B. only a DRAFT GRN can take or change lines, and only lines of its own PO
 *   C. receipts are capped at the PO line's outstanding quantity; an empty GRN cannot be confirmed
 *   H. quantities are rounded to 2 dp before they are validated
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const kraft = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG' };
const state: { grns: Row[]; grnItems: Row[]; poItems: Row[]; ledger: Row[] } = { grns: [], grnItems: [], poItems: [], ledger: [] };

const view = (g: Row): Row => ({
  ...g,
  po: { poNumber: 'PO-1', status: 'APPROVED', bomRef: null, supplierId: 's1', items: state.poItems.filter((p) => p.poId === g.poId).map((p) => ({ id: p.id, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity) })) },
  items: state.grnItems.filter((i) => i.grnId === g.id).map((i) => ({
    ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity),
    poItem: { ...state.poItems.find((p) => p.id === i.poItemId), item: kraft },
  })),
});

const mutex = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const prev = mutex.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => { release = r; });
  mutex.set(key, prev.then(() => mine));
  await prev;
  return release;
}

const db: Row = {
  misGrn: {
    // A read is answered from the state at the moment it ARRIVES, then takes a moment to come back.
    findUnique: async ({ where }: Row) => { const g = state.grns.find((x) => x.id === where.id); const seen = g ? view(g) : null; await tick(); return seen; },
    updateMany: async ({ where, data }: Row) => {
      await tick();
      const g = state.grns.find((x) => x.id === where.id && (!where.status || x.status === where.status));
      if (g) Object.assign(g, data);
      return { count: g ? 1 : 0 };
    },
    update: async ({ where, data }: Row) => { const g = state.grns.find((x) => x.id === where.id)!; Object.assign(g, data); return g; },
  },
  misGrnItem: {
    create: async ({ data }: Row) => { const row = { id: `gi${state.grnItems.length + 1}`, ...data }; state.grnItems.push(row); return row; },
    findUnique: async ({ where }: Row) => { const i = state.grnItems.find((x) => x.id === where.id); return i ? { ...i, receivedQty: D(i.receivedQty), damageQuantity: D(i.damageQuantity), dcQuantity: i.dcQuantity == null ? null : D(i.dcQuantity) } : null; },
    update: async ({ where, data }: Row) => { const i = state.grnItems.find((x) => x.id === where.id)!; Object.assign(i, data); return i; },
  },
  misPoItem: {
    findMany: async ({ where }: Row) => { const seen = state.poItems.filter((p) => where.id.in.includes(p.id)).map((p) => ({ id: p.id, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity) })); await tick(); return seen; },
    update: async ({ where, data }: Row) => {
      await tick();
      const p = state.poItems.find((x) => x.id === where.id)!;
      p.receivedQuantity += data.receivedQuantity.increment.toNumber ? data.receivedQuantity.increment.toNumber() : data.receivedQuantity.increment;
      return p;
    },
  },
  misInventoryLedger: {
    findFirst: async ({ where }: Row) => {
      const rows = state.ledger.filter((l) => l.itemId === where.itemId);
      await tick();
      return rows.length ? { balanceQty: D(rows[rows.length - 1].balanceQty) } : null;
    },
    create: async ({ data }: Row) => { await tick(); state.ledger.push({ ...data, changeQty: data.changeQty.toNumber ? data.changeQty.toNumber() : data.changeQty }); return data; },
  },
  // C1: confirming a GRN now also writes the storekeeper's book; this fake only needs to accept it.
  misStoreTransaction: { findFirst: async () => null, create: async () => null },
  misSupplierInvoice: { upsert: async () => null },
  // R3-STK B02/B01: the PO status is read with the GRN (an open PO) and moved on after a receipt.
  misPurchaseOrder: { update: async () => null },
  misOrder: { findFirst: async () => null },
  misOrderStockAllocation: { create: async () => null },
  misAuditLog: { create: async ({ data }: Row) => data },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const take = () => clone({ grns: state.grns, grnItems: state.grnItems, poItems: state.poItems, ledger: state.ledger });
    let snapshot = take();
    const released: (() => void)[] = [];
    // Everything a transaction writes comes after its locks, so the rollback point is the state once they are held.
    const tx: Row = { ...db, $queryRaw: async (_s: TemplateStringsArray, key: string) => { released.push(await acquire(key)); snapshot = take(); return [{ locked: 1 }]; } };
    try { return await cb(tx); } catch (error) { Object.assign(state, snapshot); throw error; } finally { released.forEach((r) => r()); }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./grn-alerts', () => ({ notifyGrnConfirmed: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { addGRNItem, confirmGRN, updateGRNItem } = await import('./grn');

const grn = (id: string, status = 'DRAFT', poId = 'po1'): Row => ({ id, grnNumber: id.toUpperCase(), poId, status, supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null });
const line = (grnId: string, poItemId: string, receivedQty: number, damageQuantity = 0): Row => ({ id: `${grnId}-${poItemId}`, grnId, poItemId, receivedQty, damageQuantity, dcQuantity: null, type: 'GENERAL', forOrderRef: null });

beforeEach(() => {
  vi.clearAllMocks();
  mutex.clear();
  state.grns = [grn('g1'), grn('g2'), grn('gc', 'CONFIRMED'), grn('gx', 'DRAFT', 'po2')];
  state.poItems = [
    { id: 'pi1', poId: 'po1', itemId: 'i1', quantity: 100, receivedQuantity: 0 },
    { id: 'pi2', poId: 'po2', itemId: 'i1', quantity: 50, receivedQuantity: 0 },
  ];
  state.grnItems = [];
  state.ledger = [{ itemId: 'i1', changeQty: 0, balanceQty: 0, source: 'OPENING' }];
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

const credits = () => state.ledger.filter((l) => l.source === 'GRN');

describe('A. a GRN is confirmed once, however many people press Confirm', () => {
  it('two concurrent confirms credit the ledger and the PO line exactly once', async () => {
    state.grnItems = [line('g1', 'pi1', 60)];
    const results = await Promise.allSettled([confirmGRN('g1'), confirmGRN('g1')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(String((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)).toMatch(/already confirmed/);
    expect(credits()).toHaveLength(1);
    expect(state.ledger.at(-1)!.balanceQty).toBe(60);
    expect(state.poItems[0].receivedQuantity).toBe(60);
  });
});

describe('B. only a DRAFT GRN of the right PO takes lines', () => {
  it('refuses to add a line to, or change a line on, a confirmed GRN', async () => {
    state.grnItems = [line('gc', 'pi1', 10)];
    await expect(addGRNItem('gc', { poItemId: 'pi1', receivedQty: 5 })).rejects.toThrow(/confirmed GRN cannot be edited/);
    await expect(updateGRNItem('gc-pi1', { receivedQty: 99 })).rejects.toThrow(/confirmed GRN cannot be edited/);
    expect(state.grnItems).toHaveLength(1);
    expect(state.grnItems[0].receivedQty).toBe(10);
  });

  it("refuses a PO line that belongs to another PO, on add and on update", async () => {
    await expect(addGRNItem('g1', { poItemId: 'pi2', receivedQty: 5 })).rejects.toThrow(/not on this GRN.s purchase order/);
    state.grnItems = [line('g1', 'pi1', 10)];
    await expect(updateGRNItem('g1-pi1', { poItemId: 'pi2' } as never)).rejects.toThrow(/not on this GRN.s purchase order/);
  });
});

describe('C. receipts are capped at what is outstanding; an empty GRN cannot be confirmed', () => {
  it('refuses more than the PO line still has outstanding, but allows exactly that', async () => {
    state.poItems[0].receivedQuantity = 70;
    // R3-STK B03 changed the contract: ordered + 2% (here 102) is allowed, so the refusal moves from 30.01 to 32.01.
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 32.01 })).rejects.toThrow(/more than 2%.*max 102/i);
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 32 })).resolves.toBeTruthy();
  });

  it('legitimate partial receipts keep working: 60 now, the remaining 40 on a later GRN', async () => {
    await addGRNItem('g1', { poItemId: 'pi1', receivedQty: 60 });
    await confirmGRN('g1');
    // R3-STK B03: 60 + 43 = 103 is past 102; 60 + 40 is exactly the order.
    await expect(addGRNItem('g2', { poItemId: 'pi1', receivedQty: 43 })).rejects.toThrow(/more than 2%.*max 102/i);
    await addGRNItem('g2', { poItemId: 'pi1', receivedQty: 40 });
    await confirmGRN('g2');
    expect(state.poItems[0].receivedQuantity).toBe(100);
    expect(state.ledger.at(-1)!.balanceQty).toBe(100);
  });

  it('an edit that pushes a line over the outstanding quantity is refused', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    // R3-STK B03: the cap is ordered + 2%.
    await expect(updateGRNItem('g1-pi1', { receivedQty: 102.5 })).rejects.toThrow(/more than 2%/i);
    await expect(updateGRNItem('g1-pi1', { receivedQty: 100 })).resolves.toBeTruthy();
  });

  it('two drafts that each fit alone cannot BOTH be confirmed past the PO quantity (checked again at confirm, on fresh figures)', async () => {
    state.grnItems = [line('g1', 'pi1', 60), line('g2', 'pi1', 60)];
    const results = await Promise.allSettled([confirmGRN('g1'), confirmGRN('g2')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.poItems[0].receivedQuantity).toBe(60);
    expect(credits()).toHaveLength(1);
    expect(state.grns.filter((g) => g.status === 'CONFIRMED').map((g) => g.id).sort()).toEqual(['gc', expect.stringMatching(/^g[12]$/)].sort());
  });

  it('a GRN with no lines cannot be confirmed', async () => {
    await expect(confirmGRN('g1')).rejects.toThrow(/at least one/i);
    expect(state.grns[0].status).toBe('DRAFT');
    expect(credits()).toHaveLength(0);
  });

  it('a GRN whose lines are all zero cannot be confirmed; a damage-only line can, and credits no stock', async () => {
    state.grnItems = [line('g1', 'pi1', 0, 0)];
    await expect(confirmGRN('g1')).rejects.toThrow(/at least one/i);
    state.grnItems = [line('g1', 'pi1', 0, 5)];
    await confirmGRN('g1');
    expect(state.grns[0].status).toBe('CONFIRMED');
    expect(credits()).toHaveLength(0);
    expect(state.poItems[0].receivedQuantity).toBe(0);
  });
});

describe('H. quantities are rounded to 2 dp before they are validated', () => {
  it('0.004 received is nothing at all, so the line is refused', async () => {
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: 0.004 })).rejects.toThrow(/received or damaged/i);
    expect(state.grnItems).toHaveLength(0);
  });

  it('stores the rounded figures, and checks the challan on them', async () => {
    const created = await addGRNItem('g1', { poItemId: 'pi1', receivedQty: 89.996, dcQuantity: 100.004, damageQuantity: 4.001 });
    expect(created.receivedQty).toBe(90);
    expect(created.dcQuantity).toBe(100);
    expect(created.damageQuantity).toBe(4);
    expect(created.shortQuantity).toBe(6);
  });

  it('refuses NaN and negative quantities', async () => {
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: Number.NaN })).rejects.toThrow(/valid quantity|negative/i);
    await expect(addGRNItem('g1', { poItemId: 'pi1', receivedQty: -1 })).rejects.toThrow(/negative/i);
  });
});
