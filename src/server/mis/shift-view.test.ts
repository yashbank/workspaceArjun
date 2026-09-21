/**
 * Phase 24C — the shift window and the order schedule that D4 and D5 stand on.
 *
 * Neither carries money, but both are new server doors, so each is asserted for all eight roles:
 * the four that hold `production.read` are served, the four that do not are refused at the
 * function. The interesting logic is the shift: read from settings (never hardcoded), decided
 * in the factory timezone (D22), and correct across midnight.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { shifts: Row[]; allocations: Row[]; timeZone: string } = { shifts: [], allocations: [], timeZone: 'Asia/Kolkata' };
const queries: Row[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misShift: {
      findMany: async (args: Row) => {
        queries.push(args);
        return world.shifts.filter((s) => s.isActive !== false);
      },
    },
    misMachineAllocation: {
      findMany: async (args: Row) => {
        queries.push(args);
        return world.allocations;
      },
    },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.timeZone }));

const { getFactoryShiftWindow } = await import('./shift-view');
const { getOrderSchedule } = await import('./machines-board');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const REFUSED = MIS_ROLES.filter((r) => !READERS.includes(r));
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

const SHIFT_1 = { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '15:00', isDefault: true, isActive: true };
const NIGHT = { id: 's3', name: 'Night', startTime: '22:00', endTime: '06:00', isDefault: false, isActive: true };
/** An IST wall-clock instant on 7 Sept 2026. */
const ist = (hh: number, mm = 0, day = 7) => new Date(Date.UTC(2026, 8, day, hh, mm) - 5.5 * 3_600_000);

beforeEach(() => {
  vi.clearAllMocks();
  world.shifts = [SHIFT_1];
  world.allocations = [];
  world.timeZone = 'Asia/Kolkata';
  queries.length = 0;
});

describe('getFactoryShiftWindow', () => {
  it('reads the shift from settings — start, end, name, and a duration that matches D5\'s nine hours', async () => {
    as('OWNER');
    const w = await getFactoryShiftWindow(ist(7, 12));
    expect(w).toMatchObject({ name: 'Shift 1', startMinute: 360, endMinute: 900, durationMinutes: 540, dateKey: '2026-09-07', timeZone: 'Asia/Kolkata' });
  });

  it('changing the settings changes the window — nothing is hardcoded per screen', async () => {
    as('OWNER');
    world.shifts = [{ ...SHIFT_1, startTime: '07:30', endTime: '16:30' }];
    expect(await getFactoryShiftWindow(ist(8))).toMatchObject({ startMinute: 450, endMinute: 990, durationMinutes: 540 });
  });

  it('picks the shift that is running now, not merely the first', async () => {
    as('OWNER');
    world.shifts = [SHIFT_1, { id: 's2', name: 'Shift 2', startTime: '15:00', endTime: '23:00', isDefault: false, isActive: true }];
    expect((await getFactoryShiftWindow(ist(9)))!.name).toBe('Shift 1');
    expect((await getFactoryShiftWindow(ist(17)))!.name).toBe('Shift 2');
  });

  it('outside every shift it falls back to the default rather than returning nothing', async () => {
    as('OWNER');
    expect((await getFactoryShiftWindow(ist(18)))!.name).toBe('Shift 1');
  });

  it('with no shifts configured it answers null — the screen shows its empty state, not a crash', async () => {
    as('OWNER');
    world.shifts = [];
    expect(await getFactoryShiftWindow(ist(9))).toBeNull();
  });

  it('an inactive shift is never offered', async () => {
    as('OWNER');
    world.shifts = [{ ...SHIFT_1, isActive: false }];
    expect(await getFactoryShiftWindow(ist(9))).toBeNull();
  });

  it('decides the factory DAY in the factory timezone: 00:10 IST is still 7 Sept, although it is 6 Sept in UTC', async () => {
    as('OWNER');
    world.shifts = [{ ...SHIFT_1, startTime: '00:00', endTime: '23:59' }];
    expect((await getFactoryShiftWindow(ist(0, 10)))!.dateKey).toBe('2026-09-07');
  });

  it('an overnight shift still running after midnight belongs to the day it STARTED on', async () => {
    as('OWNER');
    world.shifts = [NIGHT];
    expect((await getFactoryShiftWindow(ist(23, 0)))!.dateKey).toBe('2026-09-07');
    const after = await getFactoryShiftWindow(ist(1, 30, 8)); // 01:30 IST on the 8th
    expect(after!.dateKey).toBe('2026-09-07'); // ...yesterday's instance
    expect(after).toMatchObject({ startMinute: 1320, endMinute: 360 });
  });

  it('uses the configured factory zone, not the server clock (D22)', async () => {
    as('OWNER');
    world.timeZone = 'Asia/Singapore';
    world.shifts = [{ ...SHIFT_1, startTime: '00:00', endTime: '23:59' }];
    // 00:10 IST on the 7th is 02:40 in Singapore, still the 7th; 23:50 IST is 02:20 on the 8th there.
    expect((await getFactoryShiftWindow(ist(23, 50)))!.dateKey).toBe('2026-09-08');
  });

  it.each(READERS)('%s is served', async (role) => {
    as(role);
    expect(await getFactoryShiftWindow(ist(9))).not.toBeNull();
  });

  it.each(REFUSED)('%s is refused at the function', async (role) => {
    as(role);
    expect(await denied(() => getFactoryShiftWindow(ist(9)))).toBe(true);
    expect(queries).toEqual([]); // refused BEFORE any query ran
  });
});

describe('getOrderSchedule', () => {
  const alloc = (phase: string, machine: string, startH: number, endH: number, operators = 0) => ({
    jobPhaseId: phase,
    startsAt: ist(startH),
    endsAt: ist(endH),
    machine: { name: machine },
    _count: { workerAllocations: operators },
  });

  it('maps each phase to its machine, window and operator head-count', async () => {
    as('SUPERVISOR');
    world.allocations = [alloc('p2', 'Heidelberg SM 74', 6, 14, 4), alloc('p3', 'Lamination 1', 14, 18, 2)];
    const schedule = await getOrderSchedule('o1');
    expect(schedule.get('p2')).toMatchObject({ machineName: 'Heidelberg SM 74', operators: 4 });
    expect(schedule.get('p3')).toMatchObject({ machineName: 'Lamination 1', operators: 2 });
    expect(schedule.size).toBe(2);
  });

  it('a phase with two live bookings resolves to the LATEST-starting one', async () => {
    as('OWNER');
    world.allocations = [alloc('p2', 'Old press', 6, 8), alloc('p2', 'New press', 9, 14)];
    expect((await getOrderSchedule('o1')).get('p2')!.machineName).toBe('New press');
  });

  it('asks for one order, excluding released bookings and rows with no phase — in ONE query', async () => {
    as('OWNER');
    await getOrderSchedule('o1');
    expect(queries).toHaveLength(1);
    expect(queries[0].where).toEqual({ orderId: 'o1', releasedAt: null, jobPhaseId: { not: null } });
  });

  it('an order with no bookings yields an empty schedule, not an error', async () => {
    as('OWNER');
    expect((await getOrderSchedule('o1')).size).toBe(0);
  });

  it.each(READERS)('%s is served', async (role) => {
    as(role);
    await expect(getOrderSchedule('o1')).resolves.toBeInstanceOf(Map);
  });

  it.each(REFUSED)('%s is refused at the function', async (role) => {
    as(role);
    expect(await denied(() => getOrderSchedule('o1'))).toBe(true);
    expect(queries).toEqual([]);
  });
});
