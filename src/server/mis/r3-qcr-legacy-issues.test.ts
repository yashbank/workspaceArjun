/**
 * R3-QCR B83: the legacy (unkeyed) store issues report.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';
import { can } from '@/lib/mis/permissions';

/** Any key containing one of these is money (rate/price/value/amount/cost/wage/salary). */
const MONEY_KEYS_FOR_TEST = ['rate', 'price', 'value', 'amount', 'cost', 'wage', 'salary', 'total'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed fake-db rows
type Row = Record<string, any>;

const world: { ledger: Row[]; orders: Row[]; txns: Row[] } = { ledger: [], orders: [], txns: [] };

vi.mock('@/server/db', () => ({
  db: {
    misInventoryLedger: {
      findMany: async ({ where }: Row) =>
        world.ledger
          .filter((l) => l.source === where.source)
          .map((l): Row => ({ ...l, item: { code: 'PAP-1', name: 'Kraft paper' } }))
          .sort((a: Row, b: Row) => a.createdAt - b.createdAt),
    },
    misOrder: { findMany: async ({ where }: Row) => world.orders.filter((o) => where.id.in.includes(o.id)) },
    misStoreTransaction: { findMany: async () => world.txns },
    userProfile: { findMany: async () => [{ id: 'user-9', name: 'Ravi Store' }] },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const { listLegacyStoreIssues } = await import('./legacy-issues');

const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const ledgerRow = (id: string, sourceId: string | null, at = '2026-09-05T04:30:00Z') => ({
  id, itemId: 'item-1', changeQty: -12, balanceQty: 88, source: 'STORE_ISSUE', sourceId, notes: 'Issue 2026-09-05', createdAt: new Date(at),
});

beforeEach(() => {
  world.orders = [{ id: 'ord-1' }];
  world.ledger = [ledgerRow('l-null', null), ledgerRow('l-dangling', 'ghost-order'), ledgerRow('l-keyed', 'ord-1')];
  world.txns = [{ itemId: 'item-1', quantity: 12, referenceNo: 'REF-77', createdById: 'user-9', createdAt: new Date('2026-09-05T04:30:01Z') }];
  as('OWNER');
});

describe('listLegacyStoreIssues', () => {
  it('lists a null sourceId or a dangling one, and not a row keyed to an existing order', async () => {
    const rows = await listLegacyStoreIssues();
    expect(rows.map((r) => r.id).sort()).toEqual(['l-dangling', 'l-null']);
  });

  it('carries the factory date, item, quantity, balance, creator, notes and the matching reference', async () => {
    const [row] = await listLegacyStoreIssues();
    expect(row).toMatchObject({ when: '05/09/2026 10:00', itemCode: 'PAP-1', itemName: 'Kraft paper', quantity: 12, balanceAfter: 88, createdBy: 'Ravi Store', notes: 'Issue 2026-09-05', referenceNo: 'REF-77' });
  });

  it('an unmatched row still lists, with no reference and no creator', async () => {
    world.txns = [];
    const [row] = await listLegacyStoreIssues();
    expect(row.referenceNo).toBeNull();
    expect(row.createdBy).toBeNull();
  });

  it('no price, rate or value field anywhere in the result (money-key scan)', async () => {
    const rows = await listLegacyStoreIssues();
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.add(k.toLowerCase()); walk(x); }
    };
    walk(rows);
    expect([...keys].filter((k) => MONEY_KEYS_FOR_TEST.some((m) => k.includes(m)))).toEqual([]);
  });

  it('OWNER and ADMIN are allowed', async () => {
    for (const role of ['OWNER', 'ADMIN'] as const) {
      as(role);
      await expect(listLegacyStoreIssues()).resolves.toBeTruthy();
    }
  });

  it('STORE_GUY lacks reports.read and is forbidden', async () => {
    expect(can('STORE_GUY', 'reports.read')).toBe(false);
    as('STORE_GUY');
    await expect(listLegacyStoreIssues()).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });

  it.each(MIS_ROLES)('%s: allowed exactly when it holds BOTH reports.read and inventory.read', async (role) => {
    as(role);
    const both = can(role, 'reports.read') && can(role, 'inventory.read');
    if (both) await expect(listLegacyStoreIssues()).resolves.toBeTruthy();
    else await expect(listLegacyStoreIssues()).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
