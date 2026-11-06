/** The desktop wastage report cut to the shared range: `fromKey` and `lastKey` are the window, whatever its length. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { loggedAt: Date };
const world: { rows: Row[] } = { rows: [] };

vi.mock('@/server/db', () => ({
  db: {
    misProductionLog: {
      findMany: async (args: { where: { loggedAt: { gte: Date; lt: Date } } }) => world.rows.filter((r) => r.loggedAt >= args.where.loggedAt.gte && r.loggedAt < args.where.loggedAt.lt),
    },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const { getWastageReport } = await import('./reports');

const NOW = new Date('2026-09-10T08:00:00Z');
const log = (day: string, qtyWaste: number): Row => ({
  loggedAt: new Date(`${day}T06:00:00Z`), qtyProduced: 100, qtyWaste, unit: 'KG', machineId: null, machine: null, orderId: 'o1', order: { orderNumber: 'ORD-1', description: null }, jobPhase: null,
});

beforeEach(() => {
  world.rows = [log('2025-12-31', 1), log('2026-01-05', 2), log('2026-02-28', 4), log('2026-03-01', 8), log('2026-03-31', 16), log('2026-04-01', 32), log('2026-08-20', 64)];
});

describe('getWastageReport with a range', () => {
  it('a 31-day March holds March and nothing else; its first week is labelled from the 1st', async () => {
    const r = await getWastageReport({ fromKey: '2026-03-01', lastKey: '2026-03-31' }, NOW);
    expect(r.range).toEqual({ fromKey: '2026-03-01', toKey: '2026-03-31', weeks: 6 });
    expect(r.totals.waste).toBe(24);
    expect(r.weeks.reduce((s, w) => s + w.total, 0)).toBe(24);
    expect(r.weeks[0].startKey).toBe('2026-03-01');
  });

  it('a year is not cut to 26 weeks: it runs from 1 January, ending today when the year is still running', async () => {
    const r = await getWastageReport({ fromKey: '2026-01-01', lastKey: '2026-12-31' }, NOW);
    expect(r.range.fromKey).toBe('2026-01-01');
    expect(r.range.toKey).toBe('2026-09-10');
    expect(r.totals.waste).toBe(126);
    expect(r.weeks.reduce((s, w) => s + w.total, 0)).toBe(126);
  });

  it('a range wholly in the future reads empty over that range, not over the weeks up to today', async () => {
    const r = await getWastageReport({ fromKey: '2026-12-01', lastKey: '2026-12-31' }, NOW);
    expect(r.range).toMatchObject({ fromKey: '2026-12-01', toKey: '2026-12-31' });
    expect(r.totals.waste).toBe(0);
  });

  it('explicit weeks with no fromKey keep the trailing window', async () => {
    const r = await getWastageReport({ weeks: 4, lastKey: '2026-03-31' }, NOW);
    expect(r.range).toEqual({ fromKey: '2026-03-09', toKey: '2026-03-31', weeks: 4 });
    expect(r.totals.waste).toBe(16);
  });

  it('a bad fromKey falls back to the weeks', async () => {
    const r = await getWastageReport({ weeks: 4, fromKey: 'nonsense', lastKey: '2026-03-31' }, NOW);
    expect(r.range.weeks).toBe(4);
  });
});
