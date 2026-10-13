/**
 * C1 — stock books, GRN draft handling, material-request escalation (tester round 2).
 *
 * Real `confirmGRN` / `removeGRNItem` / `discardGRN` / `createStoreOut` / `reconcilePhysicalCount` /
 * `adjustInventory` on a stateful in-memory database. A throw inside `$transaction` restores the
 * snapshot, as a rollback would; `$queryRaw` stands in for the advisory lock (and records the keys,
 * so lock ordering can be asserted).
 *
 *   #14/D4  a GRN line with no catalog item blocks confirm, names the line, writes nothing
 *   #22     confirm writes the storekeeper's IN row as well as the ledger; no double write
 *   #24/D2  store out refuses over the balance, writes both books; nothing can go negative
 *   #23/D3  a physical count reconciles once, with a reason, into both books
 *   #11/#13 a DRAFT line can be removed and a DRAFT discarded; a CONFIRMED GRN never
 *   D7      Admin and Owner hold store.write, so they can approve what they are notified of
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { asResult } from '@/lib/mis/action-result';
import { can } from '@/lib/mis/permissions';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
// A Prisma Decimal answers both `.toNumber()` and `Number(x)` (valueOf), and so does this stand-in.
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const state: {
  grns: Row[]; grnItems: Row[]; poItems: Row[]; ledger: Row[]; txns: Row[]; counts: Row[]; audits: Row[]; lockKeys: string[]; stamp: number;
} = { grns: [], grnItems: [], poItems: [], ledger: [], txns: [], counts: [], audits: [], lockKeys: [], stamp: 0 };

const kraft = { id: 'i1', name: 'Kraft', code: 'K1', sku: null, unit: 'KG', isActive: true, deletedAt: null };
const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++state.stamp);

const match = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'startsWith' in v) return String(row[k]).startsWith(v.startsWith);
    return row[k] === v;
  });
const decimals = (r: Row, keys: string[]) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, r[k] == null ? r[k] : D(r[k])])) });
const grnView = (g: Row): Row => ({
  ...g,
  po: { poNumber: 'PO-1', status: 'APPROVED', bomRef: null, supplierId: 's1', items: state.poItems.filter((p) => p.poId === g.poId).map((p) => ({ id: p.id, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity) })) },
  items: state.grnItems.filter((i) => i.grnId === g.id).map((i) => ({
    ...decimals(i, ['receivedQty', 'damageQuantity', 'dcQuantity']),
    poItem: { ...state.poItems.find((p) => p.id === i.poItemId), ratePerUnit: D(1), item: kraft },
  })),
});

const db: Row = {
  misItem: { findFirst: async ({ where }: Row) => (where.id === 'i1' ? kraft : null) },
  misGrn: {
    findUnique: async ({ where }: Row) => { const g = state.grns.find((x) => x.id === where.id); return g ? grnView(g) : null; },
    updateMany: async ({ where, data }: Row) => {
      const g = state.grns.find((x) => x.id === where.id && (!where.status || x.status === where.status));
      if (g) Object.assign(g, data);
      return { count: g ? 1 : 0 };
    },
    deleteMany: async ({ where }: Row) => {
      const before = state.grns.length;
      state.grns = state.grns.filter((g) => !(g.id === where.id && (!where.status || g.status === where.status)));
      return { count: before - state.grns.length };
    },
  },
  misGrnItem: {
    findUnique: async ({ where }: Row) => { const i = state.grnItems.find((x) => x.id === where.id); return i ? decimals(i, ['receivedQty', 'damageQuantity', 'dcQuantity']) : null; },
    deleteMany: async ({ where }: Row) => {
      const before = state.grnItems.length;
      state.grnItems = state.grnItems.filter((i) => {
        const g = state.grns.find((x) => x.id === i.grnId);
        const byId = where.id !== undefined ? i.id === where.id : true;
        const byGrn = where.grnId !== undefined ? i.grnId === where.grnId : true;
        const byStatus = where.grn?.status ? g?.status === where.grn.status : true;
        return !(byId && byGrn && byStatus);
      });
      return { count: before - state.grnItems.length };
    },
  },
  misPoItem: {
    findMany: async ({ where }: Row) => state.poItems.filter((p) => where.id.in.includes(p.id)).map((p) => ({ id: p.id, quantity: D(p.quantity), receivedQuantity: D(p.receivedQuantity) })),
    update: async ({ where, data }: Row) => {
      const p = state.poItems.find((x) => x.id === where.id)!;
      const inc = data.receivedQuantity.increment;
      p.receivedQuantity += inc.toNumber ? inc.toNumber() : inc;
      return p;
    },
  },
  misInventoryLedger: {
    findFirst: async ({ where }: Row) => { const rows = state.ledger.filter((l) => match(l, where)); return rows.length ? { ...rows.at(-1), balanceQty: D(rows.at(-1)!.balanceQty) } : null; },
    findMany: async ({ where }: Row) => state.ledger.filter((l) => l.source === where.source && where.sourceId.in.includes(l.sourceId)).map((l) => ({ sourceId: l.sourceId })),
    create: async ({ data }: Row) => {
      const row = { id: `l${state.ledger.length + 1}`, createdAt: stamp(), ...data, changeQty: data.changeQty?.toNumber ? data.changeQty.toNumber() : data.changeQty };
      state.ledger.push(row);
      return row;
    },
  },
  misStoreTransaction: {
    findFirst: async ({ where }: Row) => {
      const rows = state.txns.filter((t) => match(t, where)).sort((a, b) => (where.txnNumber ? a.txnNumber.localeCompare(b.txnNumber) : 0));
      const last = rows.at(-1);
      return last ? { txnNumber: last.txnNumber, balanceQty: D(last.balanceQty) } : null;
    },
    create: async ({ data }: Row) => {
      const row = { id: `t${state.txns.length + 1}`, createdAt: stamp(), ...data, quantity: data.quantity?.toNumber ? data.quantity.toNumber() : data.quantity };
      state.txns.push(row);
      return { ...row, quantity: D(row.quantity), balanceQty: D(row.balanceQty) };
    },
  },
  misPhysicalCount: {
    findUnique: async ({ where }: Row) => { const c = state.counts.find((x) => x.id === where.id); return c ? { ...c, discrepancy: D(c.discrepancy) } : null; },
    findMany: async () => state.counts.map((c) => ({ ...c, physicalQty: D(c.physicalQty), systemQty: D(c.systemQty), discrepancy: D(c.discrepancy), item: { name: 'Kraft' } })),
  },
  misSupplierInvoice: { upsert: async () => null },
  // R3-STK B02/B01: an open PO is read with the GRN and moved on after a receipt.
  misPurchaseOrder: { update: async () => null },
  misOrder: { findFirst: async () => null },
  misOrderStockAllocation: { create: async () => null },
  misAuditLog: { create: async ({ data }: Row) => { state.audits.push(data); return data; } },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const snapshot = clone({ grns: state.grns, grnItems: state.grnItems, poItems: state.poItems, ledger: state.ledger, txns: state.txns });
    const tx: Row = { ...db, $queryRaw: async (_s: TemplateStringsArray, key: string) => { state.lockKeys.push(key); return [{ locked: 1 }]; } };
    try { return await cb(tx); } catch (error) { Object.assign(state, snapshot); throw error; }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./grn-alerts', () => ({ notifyGrnConfirmed: async () => undefined }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { confirmGRN, removeGRNItem, discardGRN } = await import('./grn');
const { createStoreOut, reconcilePhysicalCount, listPhysicalCounts } = await import('./store');
const { adjustInventory } = await import('./inventory');

const grn = (id: string, status = 'DRAFT'): Row => ({ id, grnNumber: id.toUpperCase(), poId: 'po1', status, supplierInvoiceNo: null, invoiceDate: null, supplierInvoiceAmount: null });
const line = (grnId: string, poItemId: string, receivedQty: number): Row => ({ id: `${grnId}-${poItemId}`, grnId, poItemId, receivedQty, damageQuantity: 0, dcQuantity: null, type: 'GENERAL', forOrderRef: null });
const seedStock = (qty: number, txnQty = qty) => {
  state.ledger = [{ id: 'l0', itemId: 'i1', changeQty: qty, balanceQty: qty, source: 'OPENING', sourceId: null, createdAt: stamp() }];
  state.txns = [{ id: 't0', txnNumber: 'STXN-20260101-0001', itemId: 'i1', type: 'IN', quantity: txnQty, balanceQty: txnQty, createdAt: stamp() }];
};
const ledgerBalance = () => state.ledger.filter((l) => l.itemId === 'i1').at(-1)?.balanceQty;
const txnBalance = () => state.txns.filter((t) => t.itemId === 'i1').at(-1)?.balanceQty;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { grns: [grn('g1'), grn('gc', 'CONFIRMED')], grnItems: [], ledger: [], txns: [], counts: [], audits: [], lockKeys: [], stamp: 0 });
  state.poItems = [
    { id: 'pi1', poId: 'po1', itemId: 'i1', description: 'Kraft 120gsm', quantity: 100, receivedQuantity: 0 },
    { id: 'pi2', poId: 'po1', itemId: null, description: 'Mystery glue', quantity: 20, receivedQuantity: 0 },
  ];
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

describe('#14/D4 a GRN line with no catalog item blocks confirm', () => {
  it('names the line, writes nothing, and the words reach the user through asResult', async () => {
    state.grnItems = [line('g1', 'pi1', 10), line('g1', 'pi2', 5)];
    const result = await asResult(() => confirmGRN('g1'));
    expect(result.ok).toBe(false);
    expect((result as { detail: string }).detail).toMatch(/Line 2/);
    expect((result as { detail: string }).detail).toMatch(/Mystery glue/);
    expect(state.grns.find((g) => g.id === 'g1')!.status).toBe('DRAFT');
    expect(state.ledger).toHaveLength(0);
    expect(state.txns).toHaveLength(0);
    expect(state.poItems[0].receivedQuantity).toBe(0);
  });

  it('a damage-only uncatalogued line is not blocked (nothing good arrived)', async () => {
    state.grnItems = [line('g1', 'pi1', 10), { ...line('g1', 'pi2', 0), damageQuantity: 2 }];
    await expect(confirmGRN('g1')).resolves.toBeTruthy();
  });
});

describe('#22 confirming a GRN writes the storekeeper book as well as the ledger', () => {
  it('chains both balances per line, referenced by the GRN number', async () => {
    seedStock(40);
    state.grnItems = [line('g1', 'pi1', 60)];
    await confirmGRN('g1');
    expect(ledgerBalance()).toBe(100);
    expect(txnBalance()).toBe(100);
    const inRow = state.txns.at(-1)!;
    expect(inRow).toMatchObject({ type: 'IN', quantity: 60, referenceNo: 'G1', isOverIssue: false, createdById: 'u1' });
    expect(inRow.txnNumber).toMatch(/^STXN-\d{8}-\d{4}$/);
    expect(state.poItems[0].receivedQuantity).toBe(60);
  });

  it('two lines for one item chain through each other with distinct txn numbers', async () => {
    state.grnItems = [line('g1', 'pi1', 30), { ...line('g1', 'pi1', 20), id: 'g1-second' }];
    await confirmGRN('g1');
    const ins = state.txns.filter((t) => t.referenceNo === 'G1');
    expect(ins.map((t) => t.balanceQty)).toEqual([30, 50]);
    expect(new Set(ins.map((t) => t.txnNumber)).size).toBe(2);
    expect(ledgerBalance()).toBe(50);
  });

  it('re-confirming a confirmed GRN is refused and writes no second pair of rows', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await confirmGRN('g1');
    const [ledgerRows, txnRows] = [state.ledger.length, state.txns.length];
    await expect(confirmGRN('g1')).rejects.toThrow(/already confirmed/);
    expect(state.ledger).toHaveLength(ledgerRows);
    expect(state.txns).toHaveLength(txnRows);
  });

  it('takes the item locks in sorted order', async () => {
    state.poItems.push({ id: 'pi3', poId: 'po1', itemId: 'i0', description: 'Glue', quantity: 10, receivedQuantity: 0 });
    state.grnItems = [line('g1', 'pi3', 1), line('g1', 'pi1', 1)];
    await confirmGRN('g1');
    expect(state.lockKeys).toEqual([...state.lockKeys].sort());
  });
});

describe('#24/D2 store out never goes below the balance', () => {
  it('refuses one unit over, with the available figure, and writes nothing', async () => {
    seedStock(10);
    const result = await asResult(() => createStoreOut({ itemId: 'i1', quantity: 10.01 }));
    expect(result).toEqual({ ok: false, detail: 'Cannot issue more than the stock balance (10 available)' });
    expect(state.ledger).toHaveLength(1);
    expect(state.txns).toHaveLength(1);
  });

  it('issues exactly the balance and writes the ledger OUT and the storekeeper OUT together', async () => {
    seedStock(10);
    const row = await createStoreOut({ itemId: 'i1', quantity: 10, referenceNo: 'JOB-1' });
    expect(ledgerBalance()).toBe(0);
    expect(txnBalance()).toBe(0);
    expect(state.ledger.at(-1)).toMatchObject({ changeQty: -10, source: 'STORE_ISSUE' });
    expect(row).toMatchObject({ type: 'OUT', quantity: 10, balanceQty: 0, isOverIssue: false });
  });

  it('is limited by the smaller book, so neither can go negative', async () => {
    seedStock(10, 4); // legacy item: the storekeeper book is behind the ledger
    await expect(createStoreOut({ itemId: 'i1', quantity: 5 })).rejects.toThrow(/\(4 available\)/);
    await expect(createStoreOut({ itemId: 'i1', quantity: 4 })).resolves.toBeTruthy();
    expect(txnBalance()).toBe(0);
    expect(ledgerBalance()).toBe(6);
  });

  it('an inventory adjustment below zero is refused and writes nothing', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    seedStock(5);
    // R3-STK B07: an adjustment now needs a reason.
    await expect(adjustInventory('i1', -5.01, 'stock write-off')).rejects.toThrow(/negative balance/);
    expect(state.ledger).toHaveLength(1);
    await expect(adjustInventory('i1', -5, 'stock write-off')).resolves.toBe(0);
  });

  it('the over-issue-with-reason input is gone: a reason cannot buy extra stock', async () => {
    seedStock(1);
    await expect(createStoreOut({ itemId: 'i1', quantity: 3, reason: 'urgent' } as never)).rejects.toThrow(/Cannot issue more/);
  });
});

describe('#23/D3 reconcile a physical count', () => {
  const count = (discrepancy: number, id = 'c1'): Row => ({
    id, itemId: 'i1', countDate: new Date('2026-10-10'), physicalQty: 10 + discrepancy, systemQty: 10, discrepancy, notes: null, createdAt: new Date(),
  });

  it('a surplus is booked IN to both books, with the count id on the ledger row', async () => {
    seedStock(10);
    state.counts = [count(2.5)];
    await reconcilePhysicalCount('c1', 'found a pallet');
    expect(ledgerBalance()).toBe(12.5);
    expect(txnBalance()).toBe(12.5);
    expect(state.ledger.at(-1)).toMatchObject({ source: 'COUNT_ADJUSTMENT', sourceId: 'c1', changeQty: 2.5 });
    expect(state.txns.at(-1)).toMatchObject({ type: 'IN', quantity: 2.5, reason: 'found a pallet' });
    expect(state.audits.some((a) => a.action === 'store.count.reconcile' && a.entityId === 'c1')).toBe(true);
  });

  it('a shortfall is booked OUT, and a count reconciles only once', async () => {
    seedStock(10);
    state.counts = [count(-3)];
    await reconcilePhysicalCount('c1', 'damaged reels');
    expect(ledgerBalance()).toBe(7);
    expect(txnBalance()).toBe(7);
    expect(state.txns.at(-1)).toMatchObject({ type: 'OUT', quantity: 3 });
    await expect(reconcilePhysicalCount('c1', 'again please')).rejects.toThrow(/already been reconciled/);
    expect(ledgerBalance()).toBe(7);
  });

  it('requires a reason of at least 3 characters', async () => {
    seedStock(10);
    state.counts = [count(1)];
    await expect(reconcilePhysicalCount('c1', ' a ')).rejects.toThrow(/reason/i);
    expect(state.ledger).toHaveLength(1);
  });

  it('a zero variance has nothing to reconcile', async () => {
    seedStock(10);
    state.counts = [count(0)];
    await expect(reconcilePhysicalCount('c1', 'no variance')).rejects.toThrow(/nothing to reconcile/);
  });

  it('R3-STK B09: the adjustment is worked out against the stock NOW, so a count taken at 10 (physical 5) with 2 left books +3, never a write-off beyond the balance', async () => {
    seedStock(2);
    state.counts = [count(-5)]; // physical 5, recorded when the system said 10; only 2 remain today
    await expect(reconcilePhysicalCount('c1', 'writing off')).resolves.toEqual({ adjustment: 3 });
    expect(ledgerBalance()).toBe(5);
    expect(txnBalance()).toBe(5);
  });

  it('"reconciled" is derived from the ledger, without a column', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    seedStock(10);
    state.counts = [count(2, 'c1'), count(-1, 'c2')];
    await reconcilePhysicalCount('c1', 'found stock');
    const rows = await listPhysicalCounts();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.reconciled]))).toEqual({ c1: true, c2: false });
  });

  it('a Supervisor cannot reconcile (store.write)', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    seedStock(10);
    state.counts = [count(1)];
    await expect(reconcilePhysicalCount('c1', 'trying it')).rejects.toThrow(/Not permitted/);
  });
});

describe('#11/#13 remove a line, discard a draft', () => {
  it('removes a line from a DRAFT and audits it', async () => {
    state.grnItems = [line('g1', 'pi1', 10), line('g1', 'pi2', 5)];
    await removeGRNItem('g1-pi2');
    expect(state.grnItems.map((i) => i.id)).toEqual(['g1-pi1']);
    expect(state.audits.some((a) => a.action === 'grn_item.delete')).toBe(true);
  });

  it('refuses to remove a line from a CONFIRMED GRN', async () => {
    state.grnItems = [line('gc', 'pi1', 10)];
    await expect(removeGRNItem('gc-pi1')).rejects.toThrow(/confirmed GRN cannot be edited/);
    expect(state.grnItems).toHaveLength(1);
  });

  it('discards a DRAFT with its lines', async () => {
    state.grnItems = [line('g1', 'pi1', 10)];
    await discardGRN('g1');
    expect(state.grns.map((g) => g.id)).toEqual(['gc']);
    expect(state.grnItems).toHaveLength(0);
    expect(state.audits.some((a) => a.action === 'grn.discard' && a.entityId === 'g1')).toBe(true);
  });

  it('refuses to discard a CONFIRMED GRN and keeps its lines', async () => {
    state.grnItems = [line('gc', 'pi1', 10)];
    await expect(discardGRN('gc')).rejects.toThrow(/confirmed GRN cannot be discarded/);
    expect(state.grns.map((g) => g.id)).toContain('gc');
    expect(state.grnItems).toHaveLength(1);
  });

  it('a role without grn.write cannot discard', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(discardGRN('g1')).rejects.toThrow(/Not permitted/);
    expect(state.grns.map((g) => g.id)).toContain('g1');
  });
});

describe('D7 who can decide a material request', () => {
  it.each(['OWNER', 'ADMIN', 'STORE_GUY'] as const)('%s holds store.write, so can open and approve /mis/store/requests', (role) => {
    expect(can(role, 'store.write')).toBe(true);
  });
});
