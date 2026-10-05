/**
 * `getMachineUtilisationReport` (E7-11) at the SERVER FUNCTION — the report `reports.ts`'s own
 * comment said could now be built once `jobPhaseId` landed on `MisMachineAllocation` (Phase 9).
 *
 * `reports.read` is held by OWNER, ADMIN, SUPERVISOR, QC and SUPER_ATTENDANCE_OPERATOR, same as
 * every other report in this file. No money anywhere in the payload (D24).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { machines: Row[]; allocations: Row[] } = { machines: [], allocations: [] };
const calls: { allocationWhere?: Row } = {};

vi.mock('@/server/db', () => ({
  db: {
    misMachine: {
      findMany: async (args: { where: { deletedAt: null } }) => world.machines.filter((m) => (args.where.deletedAt === null ? m.deletedAt == null : true)),
    },
    misMachineAllocation: {
      // Applies the caller's overlap filter, so a window too narrow really drops allocations.
      findMany: async (args: { where: { startsAt: { lt: Date }; endsAt: { gt: Date } } }) => {
        calls.allocationWhere = args.where;
        const { lt } = args.where.startsAt;
        const { gt } = args.where.endsAt;
        return world.allocations.filter((a) => (a.startsAt as Date) < lt && (a.endsAt as Date) > gt);
      },
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getMachineUtilisationReport } = await import('./reports');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'SUPER_ATTENDANCE_OPERATOR'];
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

const machine = (over: Row = {}): Row => ({ id: 'm1', code: 'MC-01', name: 'Heidelberg SM 74', isActive: true, deletedAt: null, ...over });
const alloc = (over: Row = {}): Row => ({ machineId: 'm1', startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-01T12:00:00Z'), releasedAt: null, ...over });
const RANGE = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-02T00:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  world.machines = [machine()];
  world.allocations = [alloc()];
  delete calls.allocationWhere;
});

describe('getMachineUtilisationReport — who may read it', () => {
  it.each(READERS)('%s is served a real report', async (role) => {
    as(role);
    const r = await getMachineUtilisationReport(RANGE);
    expect(r.rows[0]).toMatchObject({ machineId: 'm1', percent: 50 });
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is refused at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getMachineUtilisationReport(RANGE))).toBe(true);
    expect(calls.allocationWhere).toBeUndefined();
  });

  it.each(READERS)('%s: the payload has no money key or value — it is minutes and quantities only (D24)', async (role) => {
    as(role);
    const text = JSON.stringify(await getMachineUtilisationReport(RANGE));
    expect(text).not.toMatch(/rate|price|cost|wage|salary|amount|rupee|₹|pay\b/i);
  });
});

describe('a soft-deleted machine never appears', () => {
  it('excludes a machine with deletedAt set', async () => {
    as('OWNER');
    world.machines = [machine(), machine({ id: 'm-gone', code: 'MC-99', deletedAt: new Date('2026-01-01') })];
    const r = await getMachineUtilisationReport(RANGE);
    expect(r.rows.map((row) => row.machineId)).toEqual(['m1']);
  });
});

describe('a machine with no allocation in the window still appears, at 0%', () => {
  it('a brand-new machine with nothing booked', async () => {
    as('OWNER');
    world.machines = [machine({ id: 'idle', code: 'MC-02', name: 'Spare' })];
    world.allocations = [];
    const r = await getMachineUtilisationReport(RANGE);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ percent: 0, bookedMinutes: 0 });
  });
});
