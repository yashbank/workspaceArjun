/**
 * R3-QCR B76 (per-unit totals), B77 (factory month, half-open), B78 (clamped params).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely-typed fake-db rows
type Row = Record<string, any>;

const world: { logs: Row[] } = { logs: [] };

vi.mock('@/server/db', () => ({
  db: {
    misProductionLog: {
      findMany: async ({ where }: Row) =>
        world.logs.filter((l) => l.loggedAt >= where.loggedAt.gte && l.loggedAt < where.loggedAt.lt).map((l) => ({ order: { orderNumber: l.orderNumber, description: null }, machine: null, employee: null, ...l })),
    },
  },
}));
const getCurrentUser = vi.fn(async () => ({ id: 'u1' }));
vi.mock('@/server/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));

const { clampReportMonth, factoryMonthRange, getProductionReport } = await import('./reports');

const log = (orderId: string, qtyProduced: number, qtyWaste: number, unit: string | null, loggedAt = '2026-10-05T05:00:00Z') => ({
  orderId, orderNumber: `ORD-${orderId}`, qtyProduced, qtyWaste, unit, loggedAt: new Date(loggedAt),
});

beforeEach(() => {
  world.logs = [];
});

describe('B76 per-unit production totals', () => {
  it('500 PIECE + 200 KG gives two total rows and never a mixed 700', async () => {
    world.logs = [log('a', 500, 10, 'PIECE'), log('b', 200, 4, 'KG')];
    const { from, to } = factoryMonthRange(2026, 10, 'Asia/Kolkata');
    const report = await getProductionReport({ from, to });
    expect(report.totals).toEqual([
      { unit: 'KG', produced: 200, waste: 4, wastePct: 2 },
      { unit: 'PIECE', produced: 500, waste: 10, wastePct: 2 },
    ]);
    expect(JSON.stringify(report.totals)).not.toContain('700');
  });

  it('the same unit in different case is merged; waste % is per unit', async () => {
    world.logs = [log('a', 100, 5, 'kg'), log('a', 100, 15, ' KG'), log('c', 50, 5, 'PIECE')];
    const { from, to } = factoryMonthRange(2026, 10, 'Asia/Kolkata');
    const report = await getProductionReport({ from, to });
    expect(report.totals).toEqual([
      { unit: 'KG', produced: 200, waste: 20, wastePct: 9.1 }, // R2-343: 20 / (200 + 20)
      { unit: 'PIECE', produced: 50, waste: 5, wastePct: 9.1 }, // R2-343: 5 / (50 + 5)
    ]);
    expect(report.rows.filter((r) => r.orderNumber === 'ORD-a')).toHaveLength(1);
  });

  it('an order logged in two units shows one row per unit', async () => {
    world.logs = [log('a', 100, 0, 'KG'), log('a', 30, 0, 'PIECE')];
    const { from, to } = factoryMonthRange(2026, 10, 'Asia/Kolkata');
    const report = await getProductionReport({ from, to });
    expect(report.rows.map((r) => r.unit).sort()).toEqual(['KG', 'PIECE']);
  });
});

describe('B77 factory month, half-open', () => {
  it('October in Asia/Kolkata starts at 18:30Z on 30 Sep and ends at 18:30Z on 31 Oct', () => {
    const { from, to } = factoryMonthRange(2026, 10, 'Asia/Kolkata');
    expect(from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(to.toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });

  it('December rolls into January of the next year', () => {
    const { from, to } = factoryMonthRange(2026, 12, 'Asia/Kolkata');
    expect(from.toISOString()).toBe('2026-11-30T18:30:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T18:30:00.000Z');
  });

  it('a log at 2026-09-30T19:00Z (01:00 IST on 1 Oct) is in October, not September', async () => {
    world.logs = [log('a', 7, 0, 'KG', '2026-09-30T19:00:00Z')];
    const oct = await getProductionReport(factoryMonthRange(2026, 10, 'Asia/Kolkata'));
    const sep = await getProductionReport(factoryMonthRange(2026, 9, 'Asia/Kolkata'));
    expect(oct.totals).toEqual([{ unit: 'KG', produced: 7, waste: 0, wastePct: 0 }]);
    expect(sep.totals).toEqual([]);
  });

  it('a log at 2026-10-31T18:00Z (23:30 IST on 31 Oct) is in October, not November', async () => {
    world.logs = [log('a', 9, 0, 'KG', '2026-10-31T18:00:00Z')];
    const oct = await getProductionReport(factoryMonthRange(2026, 10, 'Asia/Kolkata'));
    const nov = await getProductionReport(factoryMonthRange(2026, 11, 'Asia/Kolkata'));
    expect(oct.totals).toHaveLength(1);
    expect(nov.totals).toEqual([]);
  });

  it('the boundary instant belongs to the next month only (half-open)', async () => {
    world.logs = [log('a', 1, 0, 'KG', '2026-10-31T18:30:00Z')];
    expect((await getProductionReport(factoryMonthRange(2026, 10, 'Asia/Kolkata'))).totals).toEqual([]);
    expect((await getProductionReport(factoryMonthRange(2026, 11, 'Asia/Kolkata'))).totals).toHaveLength(1);
  });
});

describe('B78 clampReportMonth', () => {
  const today = '2026-10-13';
  it('defaults to the factory current month', () => {
    expect(clampReportMonth({}, today)).toEqual({ year: 2026, month: 10 });
  });
  it.each([
    [{ year: '1999', month: '5' }, { year: 2026, month: 5 }],
    [{ year: '2101', month: '5' }, { year: 2026, month: 5 }],
    [{ year: '2024', month: '0' }, { year: 2024, month: 10 }],
    [{ year: '2024', month: '13' }, { year: 2024, month: 10 }],
    [{ year: 'abc', month: '-3' }, { year: 2026, month: 10 }],
    [{ year: '2024', month: '7' }, { year: 2024, month: 7 }],
    [{ year: ['2024', '2025'] as unknown, month: '7' }, { year: 2026, month: 7 }],
  ])('%j -> %j', (input, expected) => {
    expect(clampReportMonth(input, today)).toEqual(expected);
  });
});

describe('R2-343 waste % is a share of total input', () => {
  it('10 good + 90 waste is 90%, never 900%; 0 good + waste is 100%; nothing at all is null', async () => {
    world.logs = [log('a', 10, 90, 'PIECE'), log('b', 0, 5, 'KG')];
    const { from, to } = factoryMonthRange(2026, 10, 'Asia/Kolkata');
    const report = await getProductionReport({ from, to });
    expect(report.totals).toEqual([
      { unit: 'KG', produced: 0, waste: 5, wastePct: 100 },
      { unit: 'PIECE', produced: 10, waste: 90, wastePct: 90 },
    ]);
  });
});
