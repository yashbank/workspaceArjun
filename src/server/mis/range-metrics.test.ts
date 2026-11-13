/**
 * R8 review: the range widgets at the server function. AQL ceilings reach only `aql.read`, quantities are never added
 * across units, and the delivery figure counts only orders due so far and only real delivered ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';
import type { KeyRange } from '@/lib/mis/report-range';

type Order = { status: string; deliveryDate: Date };
type Where = { status: { not: string }; deliveryDate: { gte: Date; lt: Date } };

const world = {
  role: 'OWNER' as MisRoleName,
  logs: [] as Record<string, unknown>[],
  checks: [] as Record<string, unknown>[],
  orders: [] as Order[],
};

vi.mock('@/server/db', () => ({
  db: {
    misProductionLog: { findMany: async () => world.logs },
    misDefectType: { findMany: async () => [{ code: 'TEAR', name: 'Tear', severity: 'MAJOR' }] },
    misQcCheck: { findMany: async (a: { where: { checkTime?: unknown } }) => (a.where.checkTime ? world.checks : []) },
    misOrder: {
      findMany: async ({ where: w }: { where: Where }) =>
        world.orders.filter((o) => o.status !== w.status.not && o.deliveryDate >= w.deliveryDate.gte && o.deliveryDate < w.deliveryDate.lt),
    },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => world.role }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getAqlThresholds: async () => ({ criticalMax: 0, majorMax: 7, minorMax: 9 }),
}));

const { getRangeOnTime, getRangeProduction, getRangeQc } = await import('./range-metrics');

const NOV: KeyRange = { freq: 'month', at: '2026-11-01', fromKey: '2026-11-01', toKey: '2026-12-01', label: 'Nov 2026', days: 30, prevAt: '', nextAt: '' } as KeyRange;
const OCT: KeyRange = { ...NOV, fromKey: '2026-10-01', toKey: '2026-11-01', days: 31 };
const log = (qtyProduced: number, qtyWaste: number, unit: string) => ({ loggedAt: new Date('2026-11-03T06:00:00Z'), qtyProduced, qtyWaste, unit, machineId: 'm1', jobPhase: null });
const due = (day: string, status: string): Order => ({ status, deliveryDate: new Date(`${day}T00:00:00Z`) });

beforeEach(() => {
  world.role = 'OWNER';
  world.logs = [];
  world.checks = [{ defectType: 'tear', defectQty: 2 }];
  world.orders = [];
});
afterEach(() => vi.useRealTimers());

describe('getRangeQc', () => {
  const readers = MIS_ROLES.filter((r) => can(r, 'qc.read'));

  it.each(readers)('%s sees ceilings only with aql.read', async (role) => {
    world.role = role;
    const qc = await getRangeQc(NOV);
    expect(qc.aql?.major).toBe(2);
    if (can(role, 'aql.read')) expect(qc.aql?.ceilings).toEqual({ critical: 0, major: 7, minor: 9 });
    else expect(qc.aql && 'ceilings' in qc.aql).toBe(false);
  });

  it('at least one role reads QC without the ceilings, so the test above bites', () => {
    expect(readers.some((r) => !can(r, 'aql.read'))).toBe(true);
  });
});

describe('getRangeProduction', () => {
  it('keeps units apart in the totals', async () => {
    world.logs = [log(100, 5, 'KG'), log(40, 2, 'PIECE'), log(1, 1, ' kg ')];
    const p = await getRangeProduction(NOV);
    expect(p.produced).toEqual([{ unit: 'KG', qty: 101 }, { unit: 'PIECE', qty: 40 }]);
    expect(p.waste).toEqual([{ unit: 'KG', qty: 6 }, { unit: 'PIECE', qty: 2 }]);
  });

  it('draws the chart in one unit, the one with the most output, and names it', async () => {
    world.logs = [log(100, 5, 'KG'), log(40, 2, 'PIECE')];
    const p = await getRangeProduction(NOV);
    expect(p.seriesUnit).toBe('KG');
    expect(p.series.reduce((sum, d) => sum + d.produced, 0)).toBe(100);
    expect(p.series.reduce((sum, d) => sum + d.waste, 0)).toBe(5);
  });
});

describe('getRangeProduction wastage by phase', () => {
  it('counts PIECE scrap when there is no KG (R2-408), labelled with its unit', async () => {
    world.logs = [log(100, 5, 'PIECE'), log(50, 3, 'PIECE')];
    const p = await getRangeProduction(NOV);
    expect(p.wastageByPhase).toEqual([{ phase: 'No phase', kg: 8, unit: 'PIECE' }]);
  });

  it('groups by the unit with the most waste, not by KG alone', async () => {
    world.logs = [log(100, 2, 'KG'), log(40, 9, 'PIECE')];
    const p = await getRangeProduction(NOV);
    expect(p.wastageByPhase).toEqual([{ phase: 'No phase', kg: 9, unit: 'PIECE' }]);
  });
});

describe('getRangeOnTime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T06:00:00Z'));
  });

  it('stops the denominator at today', async () => {
    world.orders = [due('2026-11-10', 'DELIVERED'), due('2026-11-15', 'CONFIRMED'), due('2026-11-16', 'CONFIRMED'), due('2026-11-28', 'IN_PRODUCTION')];
    expect(await getRangeOnTime(NOV)).toEqual({ despatched: 1, total: 2 });
  });

  it('counts only DELIVERED: COMPLETED has left production, not the factory', async () => {
    world.orders = [due('2026-11-10', 'DELIVERED'), due('2026-11-11', 'COMPLETED'), due('2026-11-12', 'CANCELLED')];
    expect(await getRangeOnTime(NOV)).toEqual({ despatched: 1, total: 2 });
  });

  it('a past range is unchanged, and a future one is empty', async () => {
    world.orders = [due('2026-10-31', 'CONFIRMED')];
    expect(await getRangeOnTime(OCT)).toEqual({ despatched: 0, total: 1 });
    expect(await getRangeOnTime({ ...NOV, fromKey: '2026-12-01', toKey: '2027-01-01' })).toEqual({ despatched: 0, total: 0 });
  });

  it('a future range is clamped before the query: no inverted gte/lt window (R2-410)', async () => {
    const seen: Where[] = [];
    const spy = vi.spyOn(world, 'orders', 'get').mockImplementation(() => {
      seen.push({} as Where);
      return [];
    });
    expect(await getRangeOnTime({ ...NOV, fromKey: '2026-12-01', toKey: '2027-01-01' })).toEqual({ despatched: 0, total: 0 });
    expect(seen).toHaveLength(0);
    spy.mockRestore();
  });
});
