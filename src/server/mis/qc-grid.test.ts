/**
 * Phase 24D · D9 — `getQcHourlyGrid` at the SERVER FUNCTION.
 *
 * `qc.read` is held by OWNER, ADMIN, SUPERVISOR and QC; the other four roles are refused with no query.
 * The AQL panel's LIMITS are the Owner's (`aql.read`, D6): for everyone else the `limits` key is absent
 * and no threshold figure appears anywhere in the payload. The shift and the day are the factory's (D22).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const queries: string[] = [];
const world: { zone: string; shifts: Row[]; checks: Row[]; orders: Row[]; allocations: Row[]; audit: Row[] } = {
  zone: 'Asia/Kolkata', shifts: [], checks: [], orders: [], allocations: [], audit: [],
};

vi.mock('@/server/db', () => ({
  db: {
    misShift: { findMany: async () => { queries.push('shifts'); return world.shifts; } },
    misQcCheck: {
      findMany: async (args: { where: { checkTime: { gte: Date; lt: Date } } }) => {
        queries.push('checks');
        const { gte, lt } = args.where.checkTime;
        return world.checks.filter((c) => (c.checkTime as Date) >= gte && (c.checkTime as Date) < lt);
      },
    },
    misOrder: {
      findMany: async (args: { where: { OR: ({ status?: string; id?: { in: string[] } })[] } }) => {
        queries.push('orders');
        // honour EVERY clause of the caller's OR, whatever their number
        return world.orders.filter((o) => args.where.OR.some((c) => (c.status !== undefined && o.status === c.status) || (c.id !== undefined && c.id.in.includes(o.id as string))));
      },
    },
    misMachineAllocation: { findMany: async () => { queries.push('allocations'); return world.allocations; } },
    misAuditLog: { findFirst: async (args: { where: { entityId: string } }) => { queries.push('audit'); return world.audit.find((a) => a.entityId === args.where.entityId) ?? null; } },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));

const { getQcHourlyGrid } = await import('./qc-grid');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const ist = (hhmm: string, day = '2026-09-05') => new Date(`${day}T${hhmm}:00+05:30`);
const NOW = ist('16:00'); // Sat 5 Sep, shift 1 has ended
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

const shift1 = { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '15:00', isDefault: true };
const night = { id: 's2', name: 'Night', startTime: '22:00', endTime: '06:00', isDefault: false };
let n = 0;
const chk = (at: string, over: Row = {}, day = '2026-09-05'): Row => {
  n += 1;
  return { id: `c${n}`, orderId: 'o1', bomStageId: null, parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: ist(at, day), ...over };
};

// Odd on purpose: an exact-value match cannot be a coincidence with a count.
const LIMITS = { sampleSizeRequired: 731, breakdown: [{ severity: 'CRITICAL', found: 0, max: 0, exceeded: false }, { severity: 'MAJOR', found: 1, max: 9137, exceeded: false }] };

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  n = 0;
  world.zone = 'Asia/Kolkata';
  world.shifts = [shift1];
  world.orders = [
    { id: 'o1', orderNumber: 'ORD-118', description: 'Duplex carton', status: 'IN_PRODUCTION' },
    { id: 'o2', orderNumber: 'ORD-117', description: 'Mono carton', status: 'IN_PRODUCTION' },
    { id: 'o3', orderNumber: 'ORD-099', description: 'Old job', status: 'COMPLETED' },
  ];
  world.checks = [chk('06:20'), chk('07:20', { result: 'FAIL', defectType: 'Shade' }), chk('07:50'), chk('08:20', { orderId: 'o3' })];
  world.allocations = [{ orderId: 'o1', startsAt: ist('05:00'), endsAt: ist('18:00'), machine: { name: 'Heidelberg SM 74' } }];
  world.audit = [];
});

describe('getQcHourlyGrid — who may read it', () => {
  it.each(READERS)('%s is served the grid', async (role) => {
    as(role);
    const v = await getQcHourlyGrid({}, NOW);
    expect(v.grid!.columns).toHaveLength(9);
    expect(v.grid!.identityHolds).toBe(true);
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is REFUSED at the function — and no query runs', async (role) => {
    as(role);
    expect(await denied(() => getQcHourlyGrid({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it('an anonymous caller is refused', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await denied(() => getQcHourlyGrid({}, NOW))).toBe(true);
    expect(queries).toEqual([]);
  });

  it.each(READERS)('%s: canWrite follows qc.write', async (role) => {
    as(role);
    expect((await getQcHourlyGrid({}, NOW)).canWrite).toBe(role === 'OWNER' || role === 'ADMIN' || role === 'QC');
  });

  it.each(READERS)('%s: there is no money anywhere in the payload', async (role) => {
    as(role);
    expect(JSON.stringify(await getQcHourlyGrid({}, NOW))).not.toMatch(/rate|price|cost|wage|salary|amount|rupee|₹/i);
  });
});

describe('AQL limits are the Owner\'s (D6, aql.read)', () => {
  beforeEach(() => {
    world.checks.push(chk('09:20', { id: 'aql1', parameterName: 'AQL Sample', result: 'PASS' }));
    world.audit = [{ entityId: 'aql1', after: { decision: 'ACCEPT', sampleSize: 500, sampleSizeRequired: LIMITS.sampleSizeRequired, sampleSizeMet: false, breakdown: LIMITS.breakdown } }];
  });

  it('the OWNER receives the verdict, the sample AND the limits it was judged against', async () => {
    as('OWNER');
    const { aql } = await getQcHourlyGrid({}, NOW);
    expect(aql).toMatchObject({ orderNumber: 'ORD-118', decision: 'ACCEPT', sampleSize: 500, timeLabel: '09:20' });
    expect(aql!.limits).toEqual({ sampleSizeRequired: 731, sampleSizeMet: false, breakdown: LIMITS.breakdown });
  });

  it.each(['ADMIN', 'SUPERVISOR', 'QC'] as const)('%s receives the verdict and the sample — with NO limits key and no threshold figure', async (role) => {
    as(role);
    const { aql } = await getQcHourlyGrid({}, NOW);
    expect(aql).toMatchObject({ orderNumber: 'ORD-118', decision: 'ACCEPT', sampleSize: 500 });
    expect('limits' in aql!).toBe(false);
    const text = JSON.stringify(aql);
    expect(text).not.toMatch(/731|9137|breakdown|threshold|max|limits/);
  });

  it('a rejected sample reads REJECT for everyone, from the check\'s own result when no snapshot exists', async () => {
    world.checks = [chk('09:20', { id: 'aql2', parameterName: 'AQL Sample', result: 'FAIL' })];
    world.audit = [];
    as('QC');
    expect((await getQcHourlyGrid({}, NOW)).aql).toMatchObject({ decision: 'REJECT', sampleSize: null });
  });

  it('no AQL sample in the shift → no panel (an honest absence, not a made-up verdict)', async () => {
    world.checks = [chk('06:20')];
    as('OWNER');
    expect((await getQcHourlyGrid({}, NOW)).aql).toBeNull();
    expect(queries).not.toContain('audit');
  });
});

describe('lines, machines and cells', () => {
  it('lists every running line even with nothing checked, plus any order checked in the window', async () => {
    as('OWNER');
    const v = await getQcHourlyGrid({}, NOW);
    expect(v.grid!.rows.map((r) => r.orderNumber)).toEqual(['ORD-099', 'ORD-117', 'ORD-118']);
    const idle = v.grid!.rows.find((r) => r.orderNumber === 'ORD-117')!;
    expect(idle.cells.every((c) => c.state === 'never')).toBe(true); // running, never checked: nine missed hours, said plainly
  });

  it('a line booked mid-shift has its earlier hours NOT RUNNING, from the booking', async () => {
    as('OWNER');
    world.checks = [];
    world.allocations = [{ orderId: 'o1', startsAt: ist('14:00'), endsAt: ist('18:00'), machine: { name: 'Heidelberg SM 74' } }];
    const v = await getQcHourlyGrid({}, NOW);
    const row = v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!;
    expect(row.cells.map((c) => c.state)).toEqual(['off', 'off', 'off', 'off', 'off', 'off', 'off', 'off', 'never']);
    // ORD-117 has no booking: its run window is unknown, so every hour is due.
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-117')!.cells.every((c) => c.state === 'never')).toBe(true);
  });

  it('an order in production but booked ONLY on another shift has nothing due in this one', async () => {
    as('OWNER');
    world.checks = [];
    world.shifts = [shift1, night];
    world.allocations = [{ orderId: 'o1', startsAt: ist('08:00'), endsAt: ist('12:00'), machine: { name: 'Heidelberg SM 74' } }]; // day shift only
    const v = await getQcHourlyGrid({ shiftId: 's2', date: '2026-09-05' }, ist('01:00', '2026-09-06')); // the night shift is running
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!.cells.every((c) => c.state === 'off')).toBe(true);
    const unknown = v.grid!.rows.find((r) => r.orderNumber === 'ORD-117')!.cells.map((c) => c.state); // never booked: unknown window, every hour due
    expect(unknown.slice(0, 3)).toEqual(['never', 'never', 'never']); // 22:00, 23:00, 00:00 have ended
    expect(unknown).not.toContain('off');
  });

  it('looking BACK: a finished order booked that day is a line; an order in production TODAY with no booking is not', async () => {
    as('OWNER');
    world.checks = [];
    world.allocations = [{ orderId: 'o3', startsAt: ist('06:00', '2026-09-03'), endsAt: ist('12:00', '2026-09-03'), machine: { name: 'Lamination 1' } }];
    const v = await getQcHourlyGrid({ date: '2026-09-03' }, NOW);
    expect(v.grid!.rows.map((r) => r.orderNumber)).toEqual(['ORD-099']); // o1/o2 are IN_PRODUCTION today, not on 3 Sep
    expect(v.grid!.rows[0].cells.slice(0, 6).every((c) => c.state === 'never')).toBe(true);
    expect(v.grid!.rows[0].cells.slice(6).every((c) => c.state === 'off')).toBe(true); // booked only until 12:00
  });

  it('an order checked in the window but no longer running is still a line', async () => {
    as('OWNER');
    world.orders = world.orders.filter((o) => o.id !== 'o2');
    const v = await getQcHourlyGrid({}, NOW);
    expect(v.grid!.rows.map((r) => r.orderNumber)).toContain('ORD-099');
  });

  it('the machine comes from the booking that overlaps the shift — and a booking on another day is ignored', async () => {
    as('OWNER');
    world.allocations.push({ orderId: 'o2', startsAt: ist('06:00', '2026-09-08'), endsAt: ist('14:00', '2026-09-08'), machine: { name: 'Lamination 1' } });
    const v = await getQcHourlyGrid({}, NOW);
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!.machines).toEqual(['Heidelberg SM 74']);
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-117')!.machines).toEqual([]);
  });

  it('cells carry the recorded state, and the footer is the sum of them', async () => {
    as('OWNER');
    const v = await getQcHourlyGrid({}, NOW);
    const row = v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!;
    expect(row.cells.slice(0, 3).map((c) => c.state)).toEqual(['pass', 'fail', 'never']);
    expect(v.grid!.totals).toMatchObject({ lines: 3, columns: 9, slots: 27, fail: 1 });
    expect(v.grid!.failures[0]).toMatchObject({ orderNumber: 'ORD-118', slotLabel: '07:00', cleared: '07:50', machines: ['Heidelberg SM 74'] });
  });
});

describe('the shift and the day are the factory\'s (D22)', () => {
  it('the default shift is the one running now, on today\'s date', async () => {
    as('OWNER');
    const v = await getQcHourlyGrid({}, ist('10:00'));
    expect(v).toMatchObject({ shift: { id: 's1' }, dateKey: '2026-09-05', status: 'running' });
  });

  it('a closed shift and an upcoming one are labelled as such', async () => {
    as('OWNER');
    expect((await getQcHourlyGrid({}, NOW)).status).toBe('closed');
    expect((await getQcHourlyGrid({}, ist('05:00'))).status).toBe('upcoming');
  });

  it('an overnight shift still running at 01:00 belongs to the date it STARTED on', async () => {
    as('OWNER');
    world.shifts = [shift1, night];
    const v = await getQcHourlyGrid({}, ist('01:00', '2026-09-06'));
    expect(v).toMatchObject({ shift: { id: 's2' }, dateKey: '2026-09-05', status: 'running' });
    expect(v.grid!.columns.map((c) => c.label)).toEqual(['22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00']);
  });

  it('a check at 01:30 IST lands in the 01:00 column of the night shift, though its UTC date is the day before', async () => {
    as('OWNER');
    world.shifts = [night];
    world.checks = [chk('01:30', {}, '2026-09-06')];
    const v = await getQcHourlyGrid({ shiftId: 's2', date: '2026-09-05' }, ist('07:00', '2026-09-06'));
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!.cells[3].state).toBe('pass');
  });

  it('the column count follows the shift setting: change the shift, change the grid', async () => {
    as('OWNER');
    world.shifts = [{ ...shift1, endTime: '12:00' }];
    expect((await getQcHourlyGrid({}, NOW)).grid!.columns).toHaveLength(6);
  });

  it('with no shift set up there is no grid to draw', async () => {
    as('OWNER');
    world.shifts = [];
    const v = await getQcHourlyGrid({}, NOW);
    expect(v).toMatchObject({ shift: null, grid: null, aql: null, status: null });
    expect(queries).not.toContain('checks');
  });

  it('a requested shift and date are honoured; a future date, garbage or an array is ignored', async () => {
    as('OWNER');
    world.shifts = [shift1, night];
    expect((await getQcHourlyGrid({ shiftId: 's2', date: '2026-09-03' }, NOW))).toMatchObject({ shift: { id: 's2' }, dateKey: '2026-09-03' });
    expect((await getQcHourlyGrid({ date: '2026-12-25' }, NOW)).dateKey).toBe('2026-09-05');
    expect((await getQcHourlyGrid({ date: 'nope', shiftId: ['s2'] }, NOW))).toMatchObject({ shift: { id: 's1' }, dateKey: '2026-09-05' });
    expect((await getQcHourlyGrid({ shiftId: 'ghost' }, NOW)).shift!.id).toBe('s1');
  });

  it('an early-morning shift reads a check whose UTC date is the DAY BEFORE (01:00 IST = 19:30 UTC)', async () => {
    as('OWNER');
    world.shifts = [{ ...shift1, startTime: '00:30', endTime: '06:00' }];
    world.checks = [chk('01:00')];
    const v = await getQcHourlyGrid({}, NOW);
    expect(v.grid!.rows.find((r) => r.orderNumber === 'ORD-118')!.cells[0].state).toBe('pass'); // the 00:30 column
  });

  it('?shift=<overnight> with no date, at 01:00, is the instance that is RUNNING (it started yesterday)', async () => {
    as('OWNER');
    world.shifts = [shift1, night];
    const v = await getQcHourlyGrid({ shiftId: 's2' }, ist('01:00', '2026-09-06'));
    expect(v).toMatchObject({ shift: { id: 's2' }, dateKey: '2026-09-05', status: 'running' });
  });

  it('a check made just before the shift start (UTC-day boundary) is not in the grid', async () => {
    as('OWNER');
    world.checks = [chk('05:50')];
    expect((await getQcHourlyGrid({}, NOW)).grid!.totals.taken).toBe(0);
  });
});
