/** R2-290: the trace never adds 1,000 SHEETS to 10,000 PIECES. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const world: { logs: Row[] } = { logs: [] };

vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async () => ({ id: 'o1', orderNumber: 'ORD-1', customer: null }) },
    misBom: { findUnique: async () => null },
    misProductionLog: { findMany: async () => world.logs },
    misQcCheck: { findMany: async () => [] },
    misDocument: { findMany: async () => [] },
    misPurchaseOrder: { findMany: async () => [] },
    misInventoryLedger: { findMany: async () => [] },
    misStoreTransaction: { findMany: async () => [] },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/qc', () => ({ withCheckerNames: async (rows: unknown[]) => rows }));
vi.mock('@/server/mis/documents', () => ({ withUploaderNames: async (rows: unknown[]) => rows }));

const { getOrderTrace } = await import('./traceability');

beforeEach(() => {
  world.logs = [];
});

describe('R2-290 getOrderTrace groups production by unit', () => {
  it('mixed units: per-unit totals, flat totals null', async () => {
    world.logs = [
      { qtyProduced: 1000, qtyWaste: 10, unit: 'SHEETS' },
      { qtyProduced: 10000, qtyWaste: 0, unit: 'PIECE' },
    ];
    const t = await getOrderTrace('o1');
    expect(t.byUnit).toEqual([
      { unit: 'PIECE', produced: 10000, waste: 0 },
      { unit: 'SHEETS', produced: 1000, waste: 10 },
    ]);
    expect(t.totalProduced).toBeNull();
    expect(t.totalWaste).toBeNull();
    expect(JSON.stringify(t)).not.toContain('11000');
  });

  it('one unit (case-insensitive): flat totals are that unit', async () => {
    world.logs = [{ qtyProduced: 500, qtyWaste: 5, unit: 'kg' }, { qtyProduced: 200, qtyWaste: 1, unit: ' KG' }];
    const t = await getOrderTrace('o1');
    expect(t.byUnit).toEqual([{ unit: 'KG', produced: 700, waste: 6 }]);
    expect(t.totalProduced).toBe(700);
    expect(t.totalWaste).toBe(6);
  });
});
