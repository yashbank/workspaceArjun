/**
 * R3-STK — the store books: adjustments, issues, counts, validation, factory time, money, low stock, requests.
 * Real `adjustInventory` / `commitIssue` / `reconcilePhysicalCount` / `getStoreDashboard` / ... on a stateful
 * in-memory database (a throw inside `$transaction` restores the snapshot, as a rollback would).
 *
 *   B07 adjustInventory   B08 commitIssue   B09 reconcile   B13 quantities   B14 item props   B15 factory time
 *   B16 money formatted   B17 low stock      B19 scripts      B20 request claim   B22 invoice tolerance
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { matchSupplierInvoice } from '@/lib/mis/invoice-match';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake, like the other store tests
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });
const n = (v: unknown): number => (v == null ? 0 : typeof v === 'number' ? v : (v as { toNumber(): number }).toNumber());
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const state: {
  ledger: Row[]; txns: Row[]; counts: Row[]; audits: Row[]; items: Row[]; requests: Row[]; stamp: number;
  inWindow: { gte?: Date; lt?: Date } | null;
} = { ledger: [], txns: [], counts: [], audits: [], items: [], requests: [], stamp: 0, inWindow: null };
const kraft = { id: 'i1', name: 'Kraft', code: 'K1', sku: null, unit: 'KG', category: 'RAW_MATERIAL', reorderLevel: D(10), pricePerUnit: D(88.41), isDemo: false, isActive: true, deletedAt: null };
const stamp = () => new Date(Date.UTC(2026, 9, 1) + ++state.stamp);

const match = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'startsWith' in v) return String(row[k]).startsWith(v.startsWith);
    return row[k] === v;
  });

const db: Row = {
  misItem: {
    findFirst: async ({ where }: Row) => state.items.find((i) => i.id === where.id) ?? null,
    findMany: async (args: Row = {}) => (args.where?.id?.in ? state.items.filter((i) => args.where.id.in.includes(i.id)) : state.items),
    update: async ({ data }: Row) => ({ id: 'i1', pricePerUnit: null, reorderLevel: null, category: 'RAW_MATERIAL', ...data }),
    count: async () => 0,
  },
  misOrder: { findUnique: async () => ({ orderNumber: 'ORD-1', status: 'IN_PRODUCTION' }) },
  misDepartment: { findUnique: async () => null },
  misInventoryLedger: {
    findFirst: async ({ where }: Row) => {
      const rows = state.ledger.filter((l) => (where.itemId === undefined || l.itemId === where.itemId) && (where.source === undefined || l.source === where.source) && (where.sourceId?.in ? where.sourceId.in.includes(l.sourceId) : where.sourceId === undefined || l.sourceId === where.sourceId));
      const last = rows.at(-1);
      return last ? { id: last.id, balanceQty: D(last.balanceQty) } : null;
    },
    create: async ({ data }: Row) => { const row = { id: `l${state.ledger.length + 1}`, createdAt: stamp(), ...data, changeQty: n(data.changeQty) }; state.ledger.push(row); return row; },
  },
  misStoreTransaction: {
    findFirst: async ({ where }: Row) => { const last = state.txns.filter((t) => match(t, where)).at(-1); return last ? { txnNumber: last.txnNumber, balanceQty: D(last.balanceQty) } : null; },
    create: async ({ data }: Row) => { const row = { id: `t${state.txns.length + 1}`, createdAt: stamp(), ...data, quantity: n(data.quantity) }; state.txns.push(row); return { ...row, quantity: D(row.quantity), balanceQty: D(row.balanceQty) }; },
    findMany: async ({ where }: Row) => state.txns.filter((t) => (!where?.createdAt?.gte || t.createdAt >= where.createdAt.gte) && (!where?.createdAt?.lt || t.createdAt < where.createdAt.lt)).map((t) => ({ ...t, quantity: D(t.quantity), balanceQty: D(t.balanceQty), item: { name: 'Kraft', code: 'K1', sku: null } })),
  },
  misPhysicalCount: {
    create: async ({ data }: Row) => { const row = { id: `c${state.counts.length + 1}`, createdAt: stamp(), ...data }; state.counts.push(row); return { ...row, physicalQty: D(row.physicalQty), systemQty: D(row.systemQty), discrepancy: D(row.discrepancy) }; },
    findUnique: async ({ where }: Row) => { const c = state.counts.find((x) => x.id === where.id); return c ? { ...c, physicalQty: D(c.physicalQty), discrepancy: D(c.discrepancy) } : null; },
    findMany: async ({ where }: Row) => state.counts.filter((c) => c.itemId === where.itemId && c.countDate.getTime() === where.countDate.getTime() && c.id !== where.id.not).map((c) => ({ id: c.id })),
  },
  misMaterialRequest: {
    findUnique: async ({ where }: Row) => state.requests.find((r) => r.id === where.id) ?? null,
    updateMany: async ({ where, data }: Row) => {
      const r = state.requests.find((x) => x.id === where.id && x.status === where.status);
      if (r) Object.assign(r, data);
      return { count: r ? 1 : 0 };
    },
  },
  misMaterialRequestLine: { update: async () => null },
  $queryRaw: async () => [{ item_id: 'i1', balance_qty: 50 }],
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => {
    const snapshot = clone({ ledger: state.ledger, txns: state.txns, counts: state.counts, requests: state.requests });
    const tx: Row = { ...db, $queryRaw: async () => [{ locked: 1 }] };
    try { return await cb(tx); } catch (error) { for (const [k, v] of Object.entries(snapshot)) (state as Row)[k] = k === 'txns' || k === 'ledger' ? (v as Row[]).map((r) => ({ ...r, createdAt: new Date(r.createdAt) })) : v; throw error; }
  },
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(clone(e)); } }));
vi.mock('./notifications', () => ({ notifyRoles: async () => undefined }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const store = await import('./store');
const { adjustInventory } = await import('./inventory');
const { approveMaterialRequest } = await import('./material-request');
const as = (role: MisRoleName) => getMisRole.mockResolvedValue(role);

/** Opening stock in the ledger and the storekeeper's book. */
function seed(ledger: number, txn = ledger) {
  state.ledger = [{ id: 'l0', itemId: 'i1', changeQty: ledger, balanceQty: ledger, source: 'OPENING', sourceId: null, createdAt: stamp() }];
  state.txns = [{ id: 't0', txnNumber: 'STXN-20260101-0001', itemId: 'i1', type: 'IN', quantity: txn, balanceQty: txn, createdAt: stamp() }];
}
const ledgerBal = () => state.ledger.at(-1)!.balanceQty;
const txnBal = () => state.txns.at(-1)!.balanceQty;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, { ledger: [], txns: [], counts: [], audits: [], items: [kraft], requests: [], stamp: 0 });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  as('ADMIN');
});

describe('B07 adjustInventory', () => {
  it('+50 moves both books by 50', async () => {
    seed(10);
    await expect(adjustInventory('i1', 50, 'found a pallet')).resolves.toBe(60);
    expect(ledgerBal()).toBe(60);
    expect(txnBal()).toBe(60);
    expect(state.txns.at(-1)).toMatchObject({ type: 'IN', quantity: 50, reason: 'found a pallet' });
  });

  it('-5 with ledger 10 / txn 3 is refused (the smaller book is the stock), writing nothing', async () => {
    seed(10, 3);
    await expect(adjustInventory('i1', -5, 'damaged reels')).rejects.toThrow(/negative balance/);
    expect(state.ledger).toHaveLength(1);
    expect(state.txns).toHaveLength(1);
    await expect(adjustInventory('i1', -3, 'damaged reels')).resolves.toBe(7);
    expect(txnBal()).toBe(0);
  });

  it('a missing or too-short reason is refused and nothing is written', async () => {
    seed(10);
    for (const reason of [undefined, '', '  ', 'ab']) {
      await expect(adjustInventory('i1', 5, reason)).rejects.toThrow('Give a reason (at least 3 characters).');
    }
    expect(state.ledger).toHaveLength(1);
    expect(state.txns).toHaveLength(1);
  });
});

describe('B08 commitIssue is checked against the smaller book', () => {
  it('ledger 10, txn 4: issuing 5 is refused with the stock-balance sentence; issuing 4 works and leaves the txn book at 0', async () => {
    seed(10, 4);
    await expect(store.commitIssue([{ itemId: 'i1', qty: 5 }], {})).rejects.toThrow('Cannot issue more than the stock balance (4 available)');
    expect(state.ledger).toHaveLength(1);
    await store.commitIssue([{ itemId: 'i1', qty: 4 }], {});
    expect(txnBal()).toBe(0);
    expect(ledgerBal()).toBe(6);
    expect(state.txns.at(-1)!.isOverIssue).toBe(false);
  });
});

describe('B09 reconcile works against the stock now', () => {
  const count = (physical: number, system: number, over: Row = {}): Row => ({ id: `c${state.counts.length + 1}`, itemId: 'i1', countDate: new Date('2026-10-10'), physicalQty: physical, systemQty: system, discrepancy: physical - system, createdAt: stamp(), ...over });

  it('count 90 vs 100, 8 issued afterwards: the adjustment is -2 and the final balance is 90', async () => {
    seed(92); // 100 at count time, 8 issued since
    state.counts = [count(90, 100)];
    await expect(store.reconcilePhysicalCount('c1', 'annual count')).resolves.toEqual({ adjustment: -2 });
    expect(ledgerBal()).toBe(90);
    expect(txnBal()).toBe(90);
  });

  it('a second count of the same item on the same day is refused once the first is reconciled', async () => {
    seed(100);
    state.counts = [count(95, 100), count(96, 100, { id: 'c2' })];
    await store.reconcilePhysicalCount('c1', 'first count');
    await expect(store.reconcilePhysicalCount('c2', 'second count')).rejects.toThrow(/already reconciled/);
    expect(ledgerBal()).toBe(95);
  });
});

describe('B13 one quantity validation', () => {
  it.each([Number.NaN, 0, 0.004, -1])('store IN and OUT refuse %s', async (qty) => {
    seed(10);
    await expect(store.createStoreIn({ itemId: 'i1', quantity: qty })).rejects.toThrow(/Quantity must be positive/);
    await expect(store.createStoreOut({ itemId: 'i1', quantity: qty })).rejects.toThrow(/Quantity must be positive/);
    expect(state.ledger).toHaveLength(1);
  });

  it('1.005 is stored as 1.01 in both books', async () => {
    seed(10);
    await store.createStoreIn({ itemId: 'i1', quantity: 1.005 });
    expect(state.ledger.at(-1)!.changeQty).toBe(1.01);
    expect(state.txns.at(-1)!.quantity).toBe(1.01);
  });

  it('physical counts refuse NaN and negatives, accept 0, and round the discrepancy to 2 dp', async () => {
    seed(10);
    await expect(store.recordPhysicalCount({ itemId: 'i1', physicalQty: Number.NaN, countDate: '2026-10-10' })).rejects.toThrow(/counted quantity/);
    await expect(store.recordPhysicalCount({ itemId: 'i1', physicalQty: -1, countDate: '2026-10-10' })).rejects.toThrow(/counted quantity/);
    const zero = await store.recordPhysicalCount({ itemId: 'i1', physicalQty: 0, countDate: '2026-10-10' });
    expect(zero.discrepancy).toBe(-10);
    const odd = await store.recordPhysicalCount({ itemId: 'i1', physicalQty: 9.996, countDate: '2026-10-10' });
    expect(odd.physicalQty).toBe(10);
    expect(odd.discrepancy).toBe(0);
  });
});

describe('B14 updateStoreItemProps validation', () => {
  it('reorder level must be finite and >= 0; category must be in the enum', async () => {
    await expect(store.updateStoreItemProps('i1', { reorderLevel: -1 })).rejects.toThrow(/Reorder level/);
    await expect(store.updateStoreItemProps('i1', { reorderLevel: Number.NaN })).rejects.toThrow(/Reorder level/);
    await expect(store.updateStoreItemProps('i1', { category: 'JUNK' })).rejects.toThrow(/Category must be one of/);
    await expect(store.updateStoreItemProps('i1', { reorderLevel: 0, category: 'CONSUMABLE' })).resolves.toBeUndefined();
  });
});

describe('B15 the dashboard\'s today is the factory day', () => {
  it('a movement at 2026-10-13T19:00Z (00:30 IST on the 14th) counts for the 14th only', async () => {
    state.txns = [{ id: 't1', txnNumber: 'x', itemId: 'i1', type: 'IN', quantity: 7, balanceQty: 7, createdAt: new Date('2026-10-13T19:00:00Z') }];
    const on13 = await store.getStoreDashboard(new Date('2026-10-13T10:00:00Z')); // 15:30 IST on the 13th
    const on14 = await store.getStoreDashboard(new Date('2026-10-14T05:00:00Z')); // 10:30 IST on the 14th
    expect(on13.todayIn).toBe(0);
    expect(on14.todayIn).toBe(7);
  });
});

describe('B16 / B17 money formatted on the server, one low-stock rule', () => {
  it('the Owner gets rounded and formatted figures; no client arithmetic is needed', async () => {
    as('OWNER');
    const [row] = await store.listStockSummary();
    expect(row.stockValue).toBe(4420.5);
    expect(row.stockValueLabel).toBe('₹4,420.50');
    expect((await store.getStoreDashboard()).totalStockValueLabel).toBe('₹4,420.50');
  });

  it.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s: no money key anywhere in the summary or the dashboard (or the role is refused)', async (role) => {
    as(role);
    try {
      const text = JSON.stringify([await store.listStockSummary(), await store.getStoreDashboard()]);
      expect(text).not.toMatch(/price|value|₹|88\.41/i);
    } catch (error) {
      expect((error as Error).name).toBe('MisForbiddenError');
    }
  });

  it('a reorder level of 0 is a real level on the stock page', async () => {
    state.items = [{ ...kraft, reorderLevel: D(0) }];
    const [row] = await store.listStockSummary(); // balance 50 from the grouped query
    expect(row.reorderLevel).toBe(0);
    expect(row.belowReorder).toBe(false);
  });
});

describe('B20 a failed issue claims nothing', () => {
  it('short stock: the request stays PENDING and no approve audit row is written', async () => {
    seed(1);
    state.requests = [{ id: 'r1', requestNumber: 'MRN-1', status: 'PENDING', orderId: null, departmentId: null, lines: [{ id: 'l1', itemId: 'i1', requestedQty: D(5) }] }];
    await expect(approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 5 }])).rejects.toThrow(/Cannot issue more than the stock balance/);
    expect(state.requests[0].status).toBe('PENDING');
    expect(state.audits.some((a) => a.action === 'material_request.approve')).toBe(false);
    expect(state.ledger).toHaveLength(1);
  });

  it('with stock, the claim and the issue land together', async () => {
    seed(10);
    state.requests = [{ id: 'r1', requestNumber: 'MRN-1', status: 'PENDING', orderId: null, departmentId: null, lines: [{ id: 'l1', itemId: 'i1', requestedQty: D(5) }] }];
    // No order and no department: raw material may be issued as a general issue.
    await approveMaterialRequest('r1', [{ lineId: 'l1', actualIssuedQty: 5 }]);
    expect(state.requests[0].status).toBe('APPROVED');
    expect(ledgerBal()).toBe(5);
  });
});

describe('B22 supplier-invoice tolerance boundaries (max of Rs 1 and 0.5%)', () => {
  const lines = (qty: number) => [{ receivedQty: qty, ratePerUnit: 10, dcQuantity: qty }];
  it('Rs 1.00 on a small invoice: exactly 1.00 over matches, 1.01 over does not', () => {
    expect(matchSupplierInvoice(lines(10), 101).status).toBe('MATCHED');
    expect(matchSupplierInvoice(lines(10), 101.01).status).toBe('DISCREPANCY_PRICE');
    expect(matchSupplierInvoice(lines(10), 99).status).toBe('MATCHED');
  });
  it('0.5% on a big invoice: exactly 0.5% over matches, one paisa more does not', () => {
    expect(matchSupplierInvoice(lines(100), 1005).status).toBe('MATCHED');
    expect(matchSupplierInvoice(lines(100), 1005.01).status).toBe('DISCREPANCY_PRICE');
  });
});

describe('B19 scripts', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'scripts', f), 'utf8');
  it('e2e-cleanup is marked dev-only, has no time-window STORE_ISSUE delete, and recomputes balances in created_at, id order', () => {
    const sql = read('e2e-cleanup.sql');
    expect(sql.split('\n')[0]).toMatch(/DEV\/E2E DB ONLY — never on live/);
    expect(sql).not.toMatch(/source = 'STORE_ISSUE'/);
    expect(sql).toMatch(/ORDER BY l\.created_at, l\.id/);
  });
  it('recompute-item-balances takes the code as a psql variable and previews first', () => {
    const sql = read('recompute-item-balances.sql');
    expect(sql).toMatch(/:'item_code'/);
    expect(sql).not.toMatch(/code = 'ITEM-001'\)/);
    expect(sql.indexOf('Preview (read-only)')).toBeLessThan(sql.indexOf('BEGIN;'));
  });
});

describe('B18 GRN confirm uses the shared confirm dialog', () => {
  it('the GRN screen does not call window.confirm', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/mis/grn/grn-detail-screen.tsx'), 'utf8');
    expect(src).not.toMatch(/(^|[^.\w])confirm\(\s*'/m);
    expect(src).not.toMatch(/window\.confirm/);
    expect(src).toMatch(/useConfirm/);
  });
});
