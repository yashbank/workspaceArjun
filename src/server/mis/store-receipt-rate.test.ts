/**
 * C3 · D5 — what a delivery charged is money. `commitReceipt` and `updateStoreItemProps` may write an item's
 * `pricePerUnit` only for a role holding `wages.read` (the Owner). For everyone else the rate the browser sent is
 * dropped on the server; the stock still moves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;
const D = (n: number) => ({ toNumber: () => n });
const priceWrites: Row[] = [];
const audits: Row[] = [];
const ledger: Row[] = [];

const item = { id: 'i1', name: 'Kraft', code: 'K1', unit: 'KG', category: 'RAW_MATERIAL', isActive: true, deletedAt: null };
const db: Row = {
  misItem: {
    findMany: async () => [item],
    findFirst: async () => ({ id: 'i1', pricePerUnit: 10, reorderLevel: 5, category: 'RAW_MATERIAL' }),
    update: async ({ data }: Row) => { priceWrites.push(data); return { id: 'i1', pricePerUnit: data.pricePerUnit ?? 10, reorderLevel: 5, category: 'RAW_MATERIAL' }; },
  },
  misInventoryLedger: {
    findFirst: async () => (ledger.length ? { balanceQty: D(ledger.at(-1)!.balanceQty) } : null),
    create: async ({ data }: Row) => { ledger.push(data); return data; },
  },
  misStoreTransaction: { findFirst: async () => null, create: async ({ data }: Row) => data },
  $transaction: async (cb: (tx: Row) => Promise<unknown>) => cb({ ...db, $queryRaw: async () => [{ locked: 1 }] }),
};
vi.mock('@/server/db', () => ({ db }));
vi.mock('./audit', () => ({ logAuditEvent: async (e: Row) => { audits.push(e); } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { commitReceipt, updateStoreItemProps } = await import('./store');

const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };

beforeEach(() => {
  vi.clearAllMocks();
  priceWrites.length = 0;
  audits.length = 0;
  ledger.length = 0;
});

describe('commitReceipt — the rate is the Owner\'s (D5)', () => {
  it('the OWNER\'s rate becomes the item price', async () => {
    as('OWNER');
    await commitReceipt([{ itemId: 'i1', qty: 5, rate: 99.5 }]);
    expect(priceWrites).toEqual([{ pricePerUnit: 99.5, isDemo: false }]);
  });

  it.each(['ADMIN', 'STORE_GUY'] as MisRoleName[])('%s receives the goods but the rate they sent is ignored', async (role) => {
    as(role);
    const out = await commitReceipt([{ itemId: 'i1', qty: 5, rate: 99.5 }]);
    expect(out.totalQty).toBe(5);
    expect(ledger).toHaveLength(1); // stock moved
    expect(priceWrites).toEqual([]); // price untouched
  });

  it.each(MIS_ROLES.filter((r) => r !== 'OWNER' && r !== 'ADMIN' && r !== 'STORE_GUY'))('%s cannot receive at all', async (role) => {
    as(role);
    await expect(commitReceipt([{ itemId: 'i1', qty: 1, rate: 1 }])).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});

describe('updateStoreItemProps — the price is the Owner\'s (D5)', () => {
  it('the OWNER may set it, and the audit row carries old -> new', async () => {
    as('OWNER');
    await updateStoreItemProps('i1', { pricePerUnit: 12 });
    expect(priceWrites[0]).toMatchObject({ pricePerUnit: 12 });
    expect(JSON.stringify(audits[0])).toContain('pricePerUnit');
  });

  it.each(['ADMIN', 'STORE_GUY'] as MisRoleName[])('%s: a price in the patch is ignored; the audit price is unchanged (and stripped on read for non-owners)', async (role) => {
    as(role);
    await updateStoreItemProps('i1', { pricePerUnit: 12, reorderLevel: 7 });
    expect(priceWrites[0]).toEqual({ reorderLevel: 7 });
    expect(JSON.stringify(audits[0])).not.toContain('12');
  });
});
