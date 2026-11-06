/** R8 follow-up: the store stock filters run on the server, over the whole list, so paging and the total stay honest. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Item = { id: string; code: string; sku: null; name: string; category: string; unit: string; reorderLevel: number | null; pricePerUnit: null; isDemo: boolean };
const item = (id: string, category: string, reorderLevel: number | null): Item => ({ id, code: id, sku: null, name: id, category, unit: 'KG', reorderLevel, pricePerUnit: null, isDemo: false });
const ITEMS = [item('out', 'RAW_MATERIAL', 5), item('low', 'RAW_MATERIAL', 5), item('fine', 'CONSUMABLE', 5), item('none', 'OTHER', null)];
const BALANCES = [{ item_id: 'low', balance_qty: 3 }, { item_id: 'fine', balance_qty: 9 }, { item_id: 'none', balance_qty: 1 }];

type Where = { category?: string; id?: { in: string[] } };
const match = (where: Where) => ITEMS.filter((i) => (!where.category || i.category === where.category) && (!where.id || where.id.in.includes(i.id)));

vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      findMany: async ({ where }: { where: Where }) => match(where),
      count: async ({ where }: { where: Where }) => match(where).length,
    },
    $queryRaw: async () => BALANCES,
  },
}));
vi.mock('./auth', () => ({ requirePermission: async () => ({ userId: 'u1', role: 'STORE_GUY' }) }));

const { listStockSummaryPage } = await import('./store');
const names = async (opts: { category?: string; status?: string }) => {
  const { rows, total } = await listStockSummaryPage(opts);
  return { names: rows.map((r) => r.id), total };
};

beforeEach(() => vi.clearAllMocks());

describe('listStockSummaryPage filters', () => {
  it('no filter: every item', async () => expect((await names({})).total).toBe(4));
  it('category', async () => expect(await names({ category: 'RAW_MATERIAL' })).toEqual({ names: ['out', 'low'], total: 2 }));
  it('status: out of stock', async () => expect(await names({ status: 'critical' })).toEqual({ names: ['out'], total: 1 }));
  it('status: low stock', async () => expect(await names({ status: 'warning' })).toEqual({ names: ['low'], total: 1 }));
  it('status: ok', async () => expect(await names({ status: 'ok' })).toEqual({ names: ['fine', 'none'], total: 2 }));
  it('both together', async () => expect(await names({ category: 'RAW_MATERIAL', status: 'warning' })).toEqual({ names: ['low'], total: 1 }));
  it('an unknown value is no filter, never a query error', async () => expect((await names({ category: 'NOPE', status: 'NOPE' })).total).toBe(4));
});
