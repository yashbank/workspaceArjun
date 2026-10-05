/**
 * `qc.ts` at the SERVER FUNCTION.
 *
 * Two things fixed here, both already logged (F-18/F-34, F-19/MIS-174/191):
 *  - `getTodayQcBoard` used the server's own clock (`getHours`/`setHours`) to decide "today" and
 *    "which hour" a check belongs to; it now reads the factory's zone instead (D22), matching the
 *    discipline `getQcHourlyGrid` already uses.
 *  - A FAIL check — from the plain capture flow or a rejected AQL sample — now fans a
 *    `mis.qc_defect` notification out to every active SUPERVISOR (MIS-174/191, "immediate
 *    notification"); a PASS or N/A never does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loosely-typed fake-db row, same convention as qc-aql-decisions.test.ts
type Row = Record<string, any>;

const world: { zone: string; checks: Row[]; orders: Row[]; defectTypes: Row[] } = {
  zone: 'Asia/Kolkata',
  checks: [],
  orders: [{ id: 'ord-1', orderNumber: 'ORD-118' }],
  defectTypes: [{ id: 'dt-major', severity: 'MAJOR' }],
};
let seq = 0;
const nextId = () => `chk-${++seq}`;

const notifySupervisorsOfQcDefect = vi.fn();
vi.mock('@/server/notifications', () => ({ notifySupervisorsOfQcDefect: (...a: unknown[]) => notifySupervisorsOfQcDefect(...a) }));

vi.mock('@/server/db', () => ({
  db: {
    misQcCheck: {
      create: async ({ data }: Row) => {
        const row = { id: nextId(), result: 'PASS', parameterName: null, defectType: null, defectQty: null, notes: null, checkTime: new Date(), ...data };
        world.checks.push(row);
        return row;
      },
      findMany: async (args: { where: { checkTime: { gte: Date; lt: Date } } }) => {
        const { gte, lt } = args.where.checkTime;
        return world.checks
          .filter((c) => c.checkTime >= gte && c.checkTime < lt)
          .map((c): Row => ({ ...c, order: world.orders.find((o) => o.id === c.orderId) ?? null }))
          .sort((a, b) => (b.checkTime as Date).getTime() - (a.checkTime as Date).getTime());
      },
    },
    misOrder: {
      findUnique: async (args: { where: { id: string } }) => world.orders.find((o) => o.id === args.where.id) ?? null,
    },
    misDefectType: {
      findMany: async (args: { where: { id: { in: string[] } } }) => world.defectTypes.filter((d) => args.where.id.in.includes(d.id)),
    },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => world.zone,
  getAqlThresholds: async () => ({ sampleSize: 32, criticalMax: 0, majorMax: 2, minorMax: 5 }),
}));

const { getTodayQcBoard, addQcCheck, recordAqlSample } = await import('./qc');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const WRITERS: MisRoleName[] = ['OWNER', 'ADMIN', 'QC'];
const ist = (hhmm: string, day = '2026-09-05') => new Date(`${day}T${hhmm}:00+05:30`);
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

beforeEach(() => {
  seq = 0;
  world.zone = 'Asia/Kolkata';
  world.checks = [];
  vi.clearAllMocks();
});

describe('getTodayQcBoard — who may read it', () => {
  it.each(READERS)('%s is served a real board', async (role) => {
    as(role);
    const board = await getTodayQcBoard(ist('10:00'));
    expect(board).toBeTruthy();
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is refused at the function', async (role) => {
    as(role);
    expect(await denied(() => getTodayQcBoard(ist('10:00')))).toBe(true);
  });
});

describe('getTodayQcBoard — time is the factory\'s, never the server\'s (D22, F-18/F-34)', () => {
  it('a check at 00:20 IST (18:50 UTC the day before) lands in TODAY\'s 09:00 hour, not yesterday\'s', async () => {
    as('OWNER');
    // 09:20 IST on 5 Sep = 03:50 UTC on 5 Sep. The server-clock bug compared `getHours()` against
    // a UTC-midnight window, which would have dropped a check this close to the IST/UTC offset
    // boundary into the wrong day entirely for a server running outside IST.
    world.checks = [{ id: 'c1', orderId: 'ord-1', parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: new Date('2026-09-05T03:50:00.000Z') }];
    const board = await getTodayQcBoard(ist('10:00'));
    expect(board.checksToday).toBe(1);
    expect(board.slots.find((s) => s.hour === 9)!.state).toBe('pass');
  });

  it('a check made the evening before, still on YESTERDAY\'s factory day, is NOT counted in today\'s board', async () => {
    as('OWNER');
    // 23:55 IST on 4 Sep = 18:25 UTC on 4 Sep — a different factory day from "now" (10:00 IST, 5 Sep).
    world.checks = [{ id: 'c1', orderId: 'ord-1', parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: new Date('2026-09-04T18:25:00.000Z') }];
    const board = await getTodayQcBoard(ist('10:00'));
    expect(board.checksToday).toBe(0);
  });

  it('"now" is a parameter: an unrecorded CURRENT slot is overdue, not skipped for the next hour', async () => {
    as('OWNER');
    // 09:50 IST, nothing recorded yet anywhere — the 09:00 slot is still open and already 50 min in.
    const board = await getTodayQcBoard(ist('09:50'));
    expect(board.dueSlot).toMatchObject({ label: '09:00', minutesAway: -50 });
  });

  it('once the current slot is recorded, the due slot moves to the next hour', async () => {
    as('OWNER');
    world.checks = [{ id: 'c1', orderId: 'ord-1', parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: ist('09:10') }];
    const board = await getTodayQcBoard(ist('09:50'));
    expect(board.dueSlot).toMatchObject({ label: '10:00', minutesAway: 10 });
  });

  it('the factory zone comes from settings, not the server\'s own zone', async () => {
    as('OWNER');
    world.zone = 'Etc/GMT+12'; // UTC-12
    // 09:30 at UTC-12 on 5 Sep = 21:30 UTC on 5 Sep.
    world.checks = [{ id: 'c1', orderId: 'ord-1', parameterName: 'Shade', result: 'FAIL', defectType: 'TEAR', defectQty: 2, notes: null, checkTime: new Date('2026-09-05T21:30:00.000Z') }];
    const now = new Date('2026-09-05T22:00:00.000Z'); // 10:00 at UTC-12, same factory day
    const board = await getTodayQcBoard(now);
    expect(board.checksToday).toBe(1);
    expect(board.slots.find((s) => s.hour === 9)!.state).toBe('fail');
  });
});

describe('addQcCheck — a FAIL notifies supervisors; PASS and N/A do not (MIS-174/191)', () => {
  it.each(WRITERS)('%s logging a FAIL fans a mis.qc_defect notification out', async (role) => {
    as(role);
    await addQcCheck({ orderId: 'ord-1', result: 'FAIL', parameterName: 'Shade', defectType: 'TEAR', defectQty: 3 });
    expect(notifySupervisorsOfQcDefect).toHaveBeenCalledTimes(1);
    expect(notifySupervisorsOfQcDefect).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord-1', orderNumber: 'ORD-118', parameterName: 'Shade', defectType: 'TEAR' }),
    );
  });

  it('a PASS never notifies', async () => {
    as('QC');
    await addQcCheck({ orderId: 'ord-1', result: 'PASS', parameterName: 'Shade' });
    expect(notifySupervisorsOfQcDefect).not.toHaveBeenCalled();
  });

  it('an N/A never notifies', async () => {
    as('QC');
    await addQcCheck({ orderId: 'ord-1', result: 'NA', parameterName: 'Shade' });
    expect(notifySupervisorsOfQcDefect).not.toHaveBeenCalled();
  });

  it('a notification failure never fails — or is thrown past — the check itself', async () => {
    as('QC');
    notifySupervisorsOfQcDefect.mockRejectedValueOnce(new Error('boom'));
    const rec = await addQcCheck({ orderId: 'ord-1', result: 'FAIL', parameterName: 'Shade' });
    expect(rec.result).toBe('FAIL');
  });

  it.each(MIS_ROLES.filter((r) => !WRITERS.includes(r)))('%s is refused — nothing is written or notified', async (role) => {
    as(role);
    expect(await denied(() => addQcCheck({ orderId: 'ord-1', result: 'FAIL' }))).toBe(true);
    expect(notifySupervisorsOfQcDefect).not.toHaveBeenCalled();
  });
});

describe('recordAqlSample — a REJECT notifies supervisors; an ACCEPT does not', () => {
  it('a sample over the threshold (REJECT) notifies', async () => {
    as('QC');
    const { result } = await recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [{ defectTypeId: 'dt-major', qty: 5 }] });
    expect(result.decision).toBe('REJECT');
    expect(notifySupervisorsOfQcDefect).toHaveBeenCalledTimes(1);
    expect(notifySupervisorsOfQcDefect).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'ord-1', orderNumber: 'ORD-118', parameterName: 'AQL Sample' }));
  });

  it('a sample within the threshold (ACCEPT) never notifies', async () => {
    as('QC');
    const { result } = await recordAqlSample({ orderId: 'ord-1', sampleSize: 32, defects: [] });
    expect(result.decision).toBe('ACCEPT');
    expect(notifySupervisorsOfQcDefect).not.toHaveBeenCalled();
  });
});
