/**
 * Phase 24F · F-24 — the store and inventory pages did not open.
 *
 * Found in the browser: /mis/store, /mis/store/stock, /mis/store/dashboard, /mis/store/count, /mis/store/transactions,
 * /mis/store/ledger/[id] and /mis/inventory all died with "timeout exceeded when trying to connect". The runtime pool is
 * ONE connection wide on purpose (`createPoolConfig`, `max: 1`), and each page asked for every item's balance with one
 * query per item — 176 on the live data — so the queries queued behind each other for more than the 10 s connect timeout.
 *
 * The fix is one query for all items. These tests fail without it: they count queries against a fake database whose
 * connection would be exhausted by an N+1, and they check the balances are still the right ones.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPoolConfig } from '@/server/db/connection';

const N = 176;
const items = Array.from({ length: N }, (_, i) => ({ id: `i${i}`, code: `C${i}`, sku: null, name: `Item ${i}`, category: 'PAPER', unit: 'KG', reorderLevel: 10, pricePerUnit: 5, isDemo: false, isActive: true }));
const calls = { raw: 0, perItem: 0, other: 0 };
const balances = (extra: Record<string, number> = {}) => items.filter((_, i) => i % 2 === 0).map((it) => ({ item_id: it.id, balance_qty: 7, ...(extra[it.id] ? { balance_qty: extra[it.id] } : {}), created_at: new Date('2026-09-01T00:00:00Z') }));

vi.mock('@/server/db', () => ({
  db: {
    misItem: { findMany: async () => { calls.other += 1; return items; }, count: async () => 0 },
    misStoreTransaction: { findFirst: async () => { calls.perItem += 1; return { balanceQty: 1 }; }, findMany: async () => [] },
    misInventoryLedger: { findFirst: async () => { calls.perItem += 1; return null; } },
    $queryRaw: async () => { calls.raw += 1; return balances({ i2: 99 }); },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listStoreItems, listStockSummary, getStoreDashboard } = await import('./store');
const { getInventorySummary } = await import('./inventory');

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(calls, { raw: 0, perItem: 0, other: 0 });
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

it('the runtime pool is one connection wide — which is why one query per item cannot work', () => {
  expect(createPoolConfig('postgresql://u:p@db.example.com:5432/x').max).toBe(1);
});

describe.each([
  ['listStoreItems', () => listStoreItems()],
  ['listStockSummary', () => listStockSummary()],
  ['getStoreDashboard', () => getStoreDashboard()],
  ['getInventorySummary', () => getInventorySummary()],
])('%s', (_name, run) => {
  it(`asks for the balances of all ${N} items in ONE query, not one per item`, async () => {
    await run();
    expect(calls.raw).toBe(1);
    expect(calls.perItem).toBe(0);
  });
});

describe('the balances are still the right ones', () => {
  it('the store list carries each item\'s latest balance, and 0 for an item with no transaction', async () => {
    const rows = await listStoreItems();
    expect(rows).toHaveLength(N);
    expect(rows.find((r) => r.id === 'i0')!.stockBalance).toBe(7);
    expect(rows.find((r) => r.id === 'i2')!.stockBalance).toBe(99);
    expect(rows.find((r) => r.id === 'i1')!.stockBalance).toBe(0);
  });

  it('the stock summary flags below-reorder from the same balances', async () => {
    const rows = await listStockSummary();
    expect(rows.find((r) => r.id === 'i0')).toMatchObject({ stockBalance: 7, belowReorder: true });
    expect(rows.find((r) => r.id === 'i2')).toMatchObject({ stockBalance: 99, belowReorder: false });
    expect(rows.find((r) => r.id === 'i1')).toMatchObject({ stockBalance: 0, belowReorder: true });
  });

  it('the dashboard counts low and out-of-stock items from them', async () => {
    const stats = (await getStoreDashboard()) as { lowStockCount: number; outOfStockCount: number; totalItems: number };
    expect(stats.totalItems).toBe(N);
    expect(stats.outOfStockCount).toBe(N / 2); // every odd item has no transaction
    expect(stats.lowStockCount).toBe(N / 2 - 1); // the even items below reorder level, except the one at 99
  });

  it('the inventory summary carries balance and the time it was last updated, 0 and null for an item never moved', async () => {
    const rows = await getInventorySummary();
    expect(rows.find((r) => r.itemId === 'i0')).toMatchObject({ balance: 7, lastUpdated: new Date('2026-09-01T00:00:00Z') });
    expect(rows.find((r) => r.itemId === 'i2')!.balance).toBe(99);
    expect(rows.find((r) => r.itemId === 'i1')).toMatchObject({ balance: 0, lastUpdated: null });
  });

  it('a Decimal-like balance from the database becomes a plain number', async () => {
    // What node-postgres/Prisma hand back for a numeric column is a Decimal object, not a number.
    const dec = { toString: () => '12.50', valueOf: () => 12.5 };
    const db = (await import('@/server/db')).db as unknown as { $queryRaw: () => Promise<unknown[]> };
    db.$queryRaw = async () => [{ item_id: 'i0', balance_qty: dec, created_at: new Date() }];
    expect((await getInventorySummary()).find((r) => r.itemId === 'i0')!.balance).toBe(12.5);
    expect(typeof (await getInventorySummary())[0].balance).toBe('number');
  });
});
