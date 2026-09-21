/**
 * Phase 24C · D5 — `getMachineDayTimeline` at the server function.
 *
 * The maths is proven in `lib/mis/machine-timeline.test.ts`. This proves the DOOR: what it
 * queries (and how few times), that switched-off machines are included — the reason it exists
 * beside `getMachineBoard`, which filters them out and so could never draw downtime — and that
 * all eight roles are handled at the function.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { machines: Row[]; allocations: Row[]; shifts: Row[] } = { machines: [], allocations: [], shifts: [] };
const queries: { table: string; args: Row }[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misShift: { findMany: async (args: Row) => { queries.push({ table: 'shift', args }); return world.shifts; } },
    misMachine: { findMany: async (args: Row) => { queries.push({ table: 'machine', args }); return world.machines; } },
    misMachineAllocation: { findMany: async (args: Row) => { queries.push({ table: 'allocation', args }); return world.allocations; } },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
// machines-board imports job-phases for a helper the timeline does not use; keep it inert.
vi.mock('@/server/mis/job-phases', () => ({ isActiveStatus: () => true }));

const { getMachineDayTimeline } = await import('./machines-board');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const REFUSED = MIS_ROLES.filter((r) => !READERS.includes(r));
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};
const ist = (hh: number, mm = 0, day = 7) => new Date(Date.UTC(2026, 8, day, hh, mm) - 5.5 * 3_600_000);
const NOW = ist(7, 12);

const m = (id: string, name: string, isActive = true) => ({ id, name, code: id, machineType: null, isActive, department: { name: 'Printing' } });
const a = (machineId: string, from: number, to: number, order = 'ORD-118') => ({
  machineId, startsAt: ist(from), endsAt: ist(to), order: { orderNumber: order }, jobPhase: { process: { name: 'Printing' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  world.shifts = [{ id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '15:00', isDefault: true }];
  world.machines = [m('heid', 'Heidelberg SM 74'), m('plat2', 'Auto Platen 2', false), m('plat1', 'Auto Platen 1')];
  world.allocations = [a('heid', 6, 13)];
});

describe('what it builds', () => {
  it('returns the shift and a timeline: one running, one down, one free — the down machine INCLUDED', async () => {
    as('OWNER');
    const r = (await getMachineDayTimeline(NOW))!;
    expect(r.shift).toMatchObject({ name: 'Shift 1', dateKey: '2026-09-07', startMinute: 360, endMinute: 900 });
    expect(r.timeline.counts).toEqual({ total: 3, running: 1, free: 1, down: 1 });
    expect(r.timeline.bars.find((b) => b.machineId === 'plat2')!.kind).toBe('DOWN');
  });

  it('answers null with no shift configured, so the screen shows its empty state instead of inventing nine hours', async () => {
    as('OWNER');
    world.shifts = [];
    expect(await getMachineDayTimeline(NOW)).toBeNull();
    expect(queries.filter((q) => q.table !== 'shift')).toEqual([]); // and asks for nothing more
  });

  it('the result is plain data — no Date and no Decimal reaches a client component', async () => {
    as('OWNER');
    const walk = (v: unknown): void => {
      if (v instanceof Date) throw new Error('a Date reached the payload');
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(await getMachineDayTimeline(NOW));
  });
});

describe('what it asks the database', () => {
  it('reads machines WITHOUT an isActive filter — the whole reason a separate function exists', async () => {
    as('OWNER');
    await getMachineDayTimeline(NOW);
    const q = queries.find((x) => x.table === 'machine')!;
    expect(q.args.where).toEqual({ deletedAt: null });
    expect(JSON.stringify(q.args.where)).not.toContain('isActive');
  });

  it('excludes released bookings — a released booking is not a plan any more', async () => {
    as('OWNER');
    await getMachineDayTimeline(NOW);
    const q = queries.find((x) => x.table === 'allocation')!;
    expect((q.args.where as Row).releasedAt).toBeNull();
  });

  it('reads exactly three tables — shift, machines, allocations — once each, whatever the machine count (S8)', async () => {
    as('OWNER');
    world.machines = Array.from({ length: 40 }, (_, i) => m(`m${i}`, `Machine ${i}`));
    world.allocations = Array.from({ length: 40 }, (_, i) => a(`m${i}`, 6, 10));
    await getMachineDayTimeline(NOW);
    expect(queries.map((q) => q.table).sort()).toEqual(['allocation', 'machine', 'shift']);
  });

  it('fetches the WEEK up to the shift day, over-fetched by a day each side — the pure code does the exact clipping', async () => {
    as('OWNER');
    await getMachineDayTimeline(ist(9, 0, 10)); // Thursday 10th — week starts Monday 7th
    const where = queries.find((x) => x.table === 'allocation')!.args.where as { endsAt: { gt: Date }; startsAt: { lt: Date } };
    expect(where.endsAt.gt.toISOString().slice(0, 10)).toBe('2026-09-06');
    expect(where.startsAt.lt.toISOString().slice(0, 10)).toBe('2026-09-13');
  });
});

describe('who may call it — all eight roles, at the function', () => {
  it.each(READERS)('%s is served', async (role) => {
    as(role);
    expect(await getMachineDayTimeline(NOW)).not.toBeNull();
  });

  it.each(REFUSED)('%s is refused, before any query runs', async (role) => {
    as(role);
    await expect(getMachineDayTimeline(NOW)).rejects.toThrow(/Not permitted: production\.read/);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(getMachineDayTimeline(NOW)).rejects.toThrow(/Not permitted/);
    expect(queries).toEqual([]);
  });
});
