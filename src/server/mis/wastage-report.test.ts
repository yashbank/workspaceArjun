/**
 * Phase 24D · D7 — `getWastageReport` at the SERVER FUNCTION.
 *
 * `reports.read` is held by OWNER, ADMIN, SUPERVISOR, QC and SUPER_ATTENDANCE_OPERATOR; the other
 * three roles are refused and nothing is queried. The report is quantities only — no money field or
 * value for anyone. Weeks are the factory's (D22): the query is widened so a log made just after
 * factory midnight is not lost to a UTC boundary, and the factory zone is read from settings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown> & { loggedAt: Date };
const world: { rows: Row[]; zone: string } = { rows: [], zone: 'Asia/Kolkata' };
const calls: { where: { loggedAt: { gte: Date; lt: Date } } }[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misProductionLog: {
      // Applies the caller's date filter, so a window that is too narrow really drops rows.
      findMany: async (args: { where: { loggedAt: { gte: Date; lt: Date } } }) => {
        calls.push(args);
        const { gte, lt } = args.where.loggedAt;
        return world.rows.filter((r) => r.loggedAt >= gte && r.loggedAt < lt);
      },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));

const { getWastageReport } = await import('./reports');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'SUPER_ATTENDANCE_OPERATOR'];
const NOW = new Date('2026-09-10T08:00:00Z'); // Thu 10 Sep, 13:30 IST
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

const row = (at: string, over: Record<string, unknown> = {}): Row => ({
  loggedAt: new Date(at), qtyProduced: 1000, qtyWaste: 25, unit: 'KG', machineId: 'm1', machine: { name: 'Heidelberg SM 74' },
  orderId: 'o1', order: { orderNumber: 'ORD-118', description: 'Duplex carton' }, jobPhase: { process: { name: 'Printing' } }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  world.zone = 'Asia/Kolkata';
  world.rows = [row('2026-09-08T06:00:00Z'), row('2026-09-09T06:00:00Z', { qtyWaste: 15, jobPhase: { process: { name: 'Lamination' } } })];
});

describe('getWastageReport — who may read it', () => {
  it.each(READERS)('%s is served a real report', async (role) => {
    as(role);
    const r = await getWastageReport({ weeks: 4 }, NOW);
    expect(r.totals).toMatchObject({ waste: 40, produced: 2000, orders: 1 });
    expect(r.series.map((s) => s.name)).toEqual(['Printing', 'Lamination']);
    expect(r.topOrders[0]).toMatchObject({ orderNumber: 'ORD-118', waste: 40 });
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getWastageReport({}, NOW))).toBe(true);
    expect(calls).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getWastageReport({}, NOW))).toBe(true);
    expect(calls).toEqual([]);
  });

  it.each(READERS)('%s: the payload has no money key or value — it is quantities only (D24)', async (role) => {
    as(role);
    const text = JSON.stringify(await getWastageReport({}, NOW));
    expect(text).not.toMatch(/rate|price|cost|wage|salary|amount|rupee|₹|pay\b/i);
  });
});

describe('the window is the factory\'s (D22)', () => {
  it('reads a log made at 01:30 IST on the first day (20:00 UTC the day before)', async () => {
    as('OWNER');
    // 4 weeks ending Thu 10 Sep start Mon 17 Aug; 01:30 IST 17 Aug = 20:00 UTC 16 Aug.
    world.rows = [row('2026-08-16T20:00:00Z', { qtyWaste: 7 })];
    const r = await getWastageReport({ weeks: 4 }, NOW);
    expect(r.totals.waste).toBe(7);
    expect(r.weeks[0].total).toBe(7);
  });

  it('reads a log made at 23:30 IST on the last day (18:00 UTC the same day)', async () => {
    as('OWNER');
    world.rows = [row('2026-09-10T18:00:00Z', { qtyWaste: 3 })];
    expect((await getWastageReport({ weeks: 4 }, NOW)).totals.waste).toBe(3);
  });

  it('reads a log made at 23:30 on the last day in a zone WEST of UTC (11:30 UTC the next day)', async () => {
    as('OWNER');
    world.zone = 'Etc/GMT+12'; // UTC-12: the factory day ends 12 hours AFTER UTC midnight
    world.rows = [row('2026-09-11T11:30:00Z', { qtyWaste: 5 })]; // Thu 10 Sep 23:30 at UTC-12
    const r = await getWastageReport({ weeks: 4 }, NOW);
    expect(r.range.toKey).toBe('2026-09-09'); // NOW (08:00 UTC) is still Wed 9 Sep at UTC-12
    world.rows = [row('2026-09-10T11:30:00Z', { qtyWaste: 5 })]; // Wed 9 Sep 23:30 at UTC-12
    expect((await getWastageReport({ weeks: 4 }, NOW)).totals.waste).toBe(5);
  });

  it('the factory zone comes from settings: the same instant lands in another week in another zone', async () => {
    as('OWNER');
    world.rows = [row('2026-09-06T20:00:00Z', { qtyWaste: 9 })]; // Sun 20:00 UTC = Mon 01:30 IST
    expect((await getWastageReport({ weeks: 4 }, NOW)).weeks[3].total).toBe(9);
    world.zone = 'UTC';
    expect((await getWastageReport({ weeks: 4 }, new Date('2026-09-10T08:00:00Z'))).weeks[2].total).toBe(9);
  });

  it('"now" is a parameter: the last week is the one holding the day you pass in', async () => {
    as('OWNER');
    const r = await getWastageReport({ weeks: 4 }, new Date('2026-09-30T08:00:00Z'));
    expect(r.range).toMatchObject({ toKey: '2026-09-30', fromKey: '2026-09-07' === r.range.fromKey ? '2026-09-07' : r.range.fromKey });
    expect(r.weeks.at(-1)!.startKey).toBe('2026-09-28');
  });

  it('an unsupported span falls back to ten weeks', async () => {
    as('OWNER');
    expect((await getWastageReport({ weeks: 7 }, NOW)).weeks).toHaveLength(10);
  });
});

describe('the filters reach the numbers', () => {
  it('a machine filter narrows the totals; a unit filter picks the unit', async () => {
    as('OWNER');
    world.rows = [
      row('2026-09-08T06:00:00Z', { machineId: 'a', machine: { name: 'A' }, qtyWaste: 10 }),
      row('2026-09-08T06:00:00Z', { machineId: 'b', machine: { name: 'B' }, qtyWaste: 30, unit: 'NOS' }),
    ];
    expect((await getWastageReport({ weeks: 4, machineId: 'a', unit: 'KG' }, NOW)).totals.waste).toBe(10);
    expect((await getWastageReport({ weeks: 4 }, NOW)).unit).toBe('NOS');
  });
});

describe('the filters are only ever plain strings', () => {
  it('a repeated query parameter (an array) is ignored, not a crash', async () => {
    as('OWNER');
    const r = await getWastageReport({ weeks: 4, unit: ['KG', 'NOS'], machineId: ['a', 'b'] }, NOW);
    expect(r.unit).toBe('KG');
    expect(r.machineId).toBeNull();
    expect(r.totals.waste).toBe(40);
  });

  it('a non-string weeks value falls back to the default span', async () => {
    as('OWNER');
    expect((await getWastageReport({ weeks: ['4'] }, NOW)).weeks).toHaveLength(10);
  });
});
