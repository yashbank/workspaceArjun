/**
 * Phase 24D · F-06 — the store module's Owner-only prices, asserted at the server function.
 *
 * `store.ts` already decided price visibility with `actor.role === 'OWNER'` — correct today, but no
 * test said so, and loosening it (say, to "anyone but the store guy") would have left the suite green.
 * `store.read` is held by OWNER, ADMIN, SUPERVISOR and STORE_GUY; the other four roles are refused.
 * For the three who are not the Owner, `pricePerUnit`, `stockValue` and `totalStockValue` are ABSENT.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const PRICE = 88.41;

const item = { id: 'i1', code: 'K1', sku: null, name: 'Kraft', category: 'PAPER', unit: 'KG', reorderLevel: 10, pricePerUnit: PRICE, isDemo: false, isActive: true };

vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      findMany: async () => { queries.push('items'); return [item]; },
      count: async () => 0,
    },
    misStoreTransaction: {
      findFirst: async () => { queries.push('balance'); return { balanceQty: 50 }; },
      findMany: async () => [],
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { listStoreItems, listStockSummary, getStoreDashboard } = await import('./store');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'];
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e as Error).name === 'MisForbiddenError';
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
});

const PROBES: { name: string; run: () => Promise<unknown>; keys: string[] }[] = [
  { name: 'listStoreItems', run: () => listStoreItems(), keys: ['pricePerUnit'] },
  { name: 'listStockSummary', run: () => listStockSummary(), keys: ['pricePerUnit', 'stockValue'] },
  { name: 'getStoreDashboard', run: () => getStoreDashboard(), keys: ['totalStockValue'] },
];

describe.each(PROBES)('$name', ({ run, keys }) => {
  it('the OWNER receives the money (so an absent figure below means the role)', async () => {
    as('OWNER');
    const text = JSON.stringify(await run());
    for (const key of keys) expect(text).toContain(key);
  });

  it.each(READERS.filter((r) => r !== 'OWNER'))('%s is served the store WITHOUT any price, value or total — the keys are absent', async (role) => {
    as(role);
    const value = await run();
    const text = JSON.stringify(value);
    expect(text).not.toMatch(/price|value|Value/i);
    expect(text).not.toContain(String(PRICE));
    expect(text.length).toBeGreaterThan(30); // a real answer, not an empty one that passes by having nothing
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s (no store.read) is refused, with no query', async (role) => {
    as(role);
    expect(await denied(run)).toBe(true);
    expect(queries).toEqual([]);
  });
});

describe('the figures themselves', () => {
  it('the Owner\'s stock value is price × balance', async () => {
    as('OWNER');
    const rows = (await listStockSummary()) as Row[];
    expect(rows[0].stockValue).toBeCloseTo(PRICE * 50);
    expect(((await getStoreDashboard()) as Row).totalStockValue).toBeCloseTo(PRICE * 50);
  });
});
