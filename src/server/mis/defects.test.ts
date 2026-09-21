/**
 * Phase 24D · D14 — `getDefectReport` at the SERVER FUNCTION.
 *
 * `qc.read` is held by OWNER, ADMIN, SUPERVISOR and QC; the other four roles are refused with no query.
 * The month is the factory's (D22). There is NO money in this payload for anyone — a rupee figure on the
 * artboard has no recorded source, so none is computed, and the test proves none is sent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const world: { zone: string; checks: Row[]; orders: Row[]; masters: Row[]; allocations: Row[]; shifts: Row[]; profiles: Row[] } = {
  zone: 'Asia/Kolkata', checks: [], orders: [], masters: [], allocations: [], shifts: [], profiles: [],
};

vi.mock('@/server/db', () => ({
  db: {
    misQcCheck: {
      findMany: async (args: { where: { result: string; checkTime: { gte: Date; lt: Date } } }) => {
        queries.push('checks');
        const { gte, lt } = args.where.checkTime;
        return world.checks.filter((c) => c.result === args.where.result && (c.checkTime as Date) >= gte && (c.checkTime as Date) < lt);
      },
    },
    misOrder: { findMany: async () => { queries.push('orders'); return world.orders; } },
    misDefectType: { findMany: async () => { queries.push('masters'); return world.masters; } },
    misMachineAllocation: { findMany: async () => { queries.push('allocations'); return world.allocations; } },
    misShift: { findMany: async () => { queries.push('shifts'); return world.shifts; } },
    userProfile: { findMany: async () => { queries.push('profiles'); return world.profiles; } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));

const { getDefectReport } = await import('./defects');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const NOW = new Date('2026-08-28T10:00:00Z');
const at = (iso: string) => new Date(`${iso}+05:30`);
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

let n = 0;
const fail = (when: string, over: Row = {}): Row => {
  n += 1;
  return { id: `c${n}`, orderId: 'o1', checkTime: at(when), checkById: 'p1', result: 'FAIL', defectType: 'Mis-registration', defectQty: 100, notes: null, parameterName: 'Registration', ...over };
};

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  n = 0;
  world.zone = 'Asia/Kolkata';
  world.orders = [{ id: 'o1', orderNumber: 'ORD-118' }];
  world.masters = [{ id: 'd1', code: 'MISREG', name: 'Mis-registration', severity: 'MAJOR' }];
  world.allocations = [{ orderId: 'o1', startsAt: at('2026-08-01T00:00:00'), endsAt: at('2026-08-31T23:00:00'), releasedAt: null, machine: { name: 'Heidelberg SM 74' } }];
  world.shifts = [{ name: 'Shift 1', startTime: '06:00', endTime: '15:00' }, { name: 'Shift 2', startTime: '15:00', endTime: '00:00' }];
  world.profiles = [{ id: 'p1', name: 'S. Kulkarni' }];
  world.checks = [fail('2026-08-27T09:00:00'), fail('2026-08-28T16:00:00', { defectQty: 40 }), { ...fail('2026-08-27T10:00:00'), result: 'PASS' }];
});

describe('getDefectReport — who may read it', () => {
  it.each(READERS)('%s is served the report', async (role) => {
    as(role);
    const v = await getDefectReport({}, NOW);
    expect(v).toMatchObject({ monthKey: '2026-08', entries: 2, quantity: 140, running: true });
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getDefectReport({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getDefectReport({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it.each(READERS)('%s: there is no money anywhere in the payload — no rate, price, cost or rupee', async (role) => {
    as(role);
    const { canWrite, ...rest } = await getDefectReport({}, NOW);
    void canWrite;
    expect(JSON.stringify(rest)).not.toMatch(/rate\b|price|cost|wage|salary|amount|rupee|₹/i);
  });

  it.each(READERS)('%s: canWrite follows qc.write', async (role) => {
    as(role);
    expect((await getDefectReport({}, NOW)).canWrite).toBe(role !== 'SUPERVISOR');
  });
});

describe('only FAIL checks are defects', () => {
  it('a PASS is not in the report, and the log rows carry the order, machine, reason, severity and the person', async () => {
    as('OWNER');
    const v = await getDefectReport({}, NOW);
    expect(v.log).toHaveLength(2);
    expect(v.log[0]).toMatchObject({ orderNumber: 'ORD-118', dateKey: '2026-08-28', timeLabel: '16:00', machine: 'Heidelberg SM 74', reasonLabel: 'Mis-registration', severity: 'MAJOR', qty: 40, by: 'S. Kulkarni' });
  });

  it('a checker with no profile is shown as unknown — not another person', async () => {
    as('OWNER');
    world.profiles = [];
    expect((await getDefectReport({}, NOW)).log[0].by).toBe('—');
  });
});

describe('the month is the factory\'s (D22)', () => {
  it('defaults to the factory\'s current month, and is flagged running', async () => {
    as('OWNER');
    const v = await getDefectReport({}, NOW);
    expect(v).toMatchObject({ monthKey: '2026-08', currentKey: '2026-08', prevKey: '2026-07', nextKey: null, running: true });
  });

  it('01:30 IST on 1 Sep is still 31 Aug in UTC — the factory is already in September', async () => {
    as('OWNER');
    const v = await getDefectReport({}, new Date('2026-08-31T20:00:00Z'));
    expect(v.monthKey).toBe('2026-09');
  });

  it('a past month is finished; the next month is offered; a future month is clamped; garbage is ignored', async () => {
    as('OWNER');
    world.checks = [fail('2026-07-15T10:00:00')];
    const past = await getDefectReport({ month: '2026-07' }, NOW);
    expect(past).toMatchObject({ monthKey: '2026-07', running: false, nextKey: '2026-08', entries: 1 });
    expect((await getDefectReport({ month: '2027-03' }, NOW)).monthKey).toBe('2026-08');
    expect((await getDefectReport({ month: ['2026-07'] }, NOW)).monthKey).toBe('2026-08');
    expect((await getDefectReport({ month: 'nope' }, NOW)).monthKey).toBe('2026-08');
  });

  it('a check made at 23:30 IST on the last day (18:00 UTC) and one at 00:30 IST on the first are in the right months', async () => {
    as('OWNER');
    world.checks = [fail('2026-08-31T23:30:00'), fail('2026-09-01T00:30:00')];
    expect((await getDefectReport({ month: '2026-08' }, new Date('2026-09-15T00:00:00Z'))).entries).toBe(1);
    expect((await getDefectReport({ month: '2026-09' }, new Date('2026-09-15T00:00:00Z'))).entries).toBe(1);
  });
});

describe('filters and honesty', () => {
  it('a machine and a severity filter narrow the report; garbage or an array is ignored', async () => {
    as('OWNER');
    world.checks = [fail('2026-08-27T09:00:00'), fail('2026-08-27T10:00:00', { defectType: 'Ink smudge', defectQty: 7 })];
    expect((await getDefectReport({ severity: 'MAJOR' }, NOW)).entries).toBe(1);
    expect((await getDefectReport({ severity: 'UNCLASSIFIED' }, NOW)).quantity).toBe(7);
    expect((await getDefectReport({ machine: 'Heidelberg SM 74' }, NOW)).entries).toBe(2);
    expect((await getDefectReport({ machine: ['x'], severity: ['MAJOR'] }, NOW)).entries).toBe(2);
  });

  it('a STRING that is not a severity is ignored, not a filter that empties the month', async () => {
    as('OWNER');
    const v = await getDefectReport({ severity: 'FOO' }, NOW);
    expect(v.filters.severity).toBeNull();
    expect(v.entries).toBe(2);
    expect((await getDefectReport({ severity: 'major' }, NOW)).filters.severity).toBeNull(); // exact keys only
  });

  it('a released booking stops attributing when it was released, not when it was planned to end', async () => {
    as('OWNER');
    world.allocations = [{ ...(world.allocations[0] as Row), releasedAt: at('2026-08-28T12:00:00') }];
    const v = await getDefectReport({}, NOW);
    expect(v.log.find((l) => l.timeLabel === '16:00')!.machine).toBe('__none'); // after the release
    expect(v.log.find((l) => l.timeLabel === '09:00')!.machine).toBe('Heidelberg SM 74');
  });

  it('nothing recorded that the artboard shows is invented: no disposition, cost or rate keys', async () => {
    as('OWNER');
    const keys = JSON.stringify(Object.keys(await getDefectReport({}, NOW)));
    expect(keys).not.toMatch(/disposition|scrap|rework|cost|rate|batch/i);
  });
});
