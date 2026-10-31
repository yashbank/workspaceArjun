/** R2-121 — the Issue screen's BOM-material context: what each stage material calls for, and how much has gone out. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const boms: Row[] = [
  {
    orderId: 'o1',
    stages: [
      { stageName: 'Printing', materials: [
        { description: 'Ink', itemId: 'i1', quantity: { toNumber: () => 10 }, unit: 'LITRE' },
        { description: 'Custom foil', itemId: null, quantity: { toNumber: () => 2 }, unit: 'ROLL' },
      ] },
    ],
  },
];
const issues: Row[] = [{ sourceId: 'o1', itemId: 'i1', changeQty: { toNumber: () => -4 } }];
const findManyBom = vi.fn(async (_a?: Row) => boms);
const findManyLedger = vi.fn(async (_a?: Row) => issues);
vi.mock('@/server/db', () => ({ db: { misBom: { findMany: (a: Row) => findManyBom(a) }, misInventoryLedger: { findMany: (a: Row) => findManyLedger(a) } } }));

const { listOpenOrderBomMaterials } = await import('./order-allocation');

beforeEach(() => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('STORE_GUY');
});

describe('listOpenOrderBomMaterials', () => {
  it('R2-268: BOM quantities are per finished unit — the order quantity scales what is required (none = x1)', async () => {
    boms[0].order = { quantity: { toNumber: () => 500 } };
    try {
      const rows = (await listOpenOrderBomMaterials())['o1'];
      expect(rows.find((r) => r.description === 'Ink')).toMatchObject({ required: 5000, issued: 4, remaining: 4996 });
      expect(rows.find((r) => r.description === 'Custom foil')).toMatchObject({ required: 1000 });
    } finally {
      delete boms[0].order;
    }
  });

  it('reports required vs issued for a catalogued material', async () => {
    const out = await listOpenOrderBomMaterials();
    const ink = out.o1.find((m) => m.description === 'Ink')!;
    expect(ink).toMatchObject({ stageName: 'Printing', required: 10, issued: 4, remaining: 6, unit: 'LITRE' });
  });

  it('an uncatalogued material (no itemId) has no issued/remaining figure', async () => {
    const out = await listOpenOrderBomMaterials();
    const foil = out.o1.find((m) => m.description === 'Custom foil')!;
    expect(foil).toMatchObject({ itemId: null, required: 2, issued: null, remaining: null });
  });

  it('refuses a role without store.read', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(listOpenOrderBomMaterials()).rejects.toThrow();
  });
});
