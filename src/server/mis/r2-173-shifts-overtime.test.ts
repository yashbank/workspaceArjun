import { beforeEach, describe, expect, it, vi } from 'vitest';

import { punchMinutes } from '@/lib/mis/punch-minutes';

/** R2-173: clock-out shift, OT past shift end, busy carry-over. Fake db; "now" is 2026-10-13 17:00 IST. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const store = { att: [] as Row[], shifts: [] as Row[] };
const wa = vi.fn();
const attFind = vi.fn();
const fakeDb: Row = {
  misAttendance: {
    findMany: async ({ where }: Row) => (where.date ? store.att.filter((r) => r.date.getTime() === where.date.getTime()) : []),
    update: async ({ where, data }: Row) => Object.assign(store.att.find((r) => r.id === where.id)!, data),
  },
  misEmployee: { findMany: async ({ where }: Row) => (where.id?.in ? [{ id: 'e1' }] : [{ id: 'e1', name: 'Ramesh', employeeCode: 'E-01' }]) },
  misShift: { findUnique: async ({ where }: Row) => store.shifts.find((s) => s.id === where.id) ?? null, findFirst: async () => null },
  misPayrollPeriod: { findUnique: async () => null },
  misWorkerAllocation: { findMany: (...a: unknown[]) => wa(...a) },
  misLeaveRequest: { findMany: async () => [] },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
};
vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleEmployeeWhere: async () => ({}) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata', getCorrectionWindowDays: async () => 30, getLunchBreakMinutes: async () => 30 }));

const att = await import('./attendance');
const alloc = await import('./worker-allocation');
void attFind;

const DAY = new Date('2026-10-13T00:00:00Z');
const S1 = { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true };
const S2 = { id: 's2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-13T11:30:00Z')); // 17:00 IST
  store.shifts = [S1, S2];
  store.att = [{ id: 'a1', employeeId: 'e1', date: DAY, status: 'PRESENT', shiftId: 's1', clockIn: new Date('2026-10-13T00:30:00Z'), clockOut: null, otMinutes: 0, editedAt: null }];
  wa.mockReset();
});

describe('R2-173 clock-out shift + overtime', () => {
  it('past shift end: minutes beyond the end are OT (not double counted)', async () => {
    await att.bulkPunch('OUT', ['e1'], { shiftId: 's1' });
    expect(store.att[0].otMinutes).toBe(180); // 17:00 - 14:00
    expect(store.att[0].shiftId).toBe('s1');
  });

  it('the dropdown shift is stored and OT follows that shift', async () => {
    await att.bulkPunch('OUT', ['e1'], { shiftId: 's2' });
    expect(store.att[0]).toMatchObject({ shiftId: 's2', otMinutes: 0 });
  });

  it('an inactive or unknown shift is refused', async () => {
    await expect(att.bulkPunch('OUT', ['e1'], { shiftId: 'nope' })).rejects.toThrow(/not an active shift/);
  });

  it('regression: a normal in-shift punch has no OT', async () => {
    vi.setSystemTime(new Date('2026-10-13T07:00:00Z')); // 12:30 IST
    await att.bulkPunch('OUT', ['e1']);
    expect(store.att[0].otMinutes).toBe(0);
    expect(punchMinutes({ workDate: '2026-10-13', clockIn: null, clockOut: new Date('2026-10-13T07:00:00Z') }, S1, 'Asia/Kolkata').otMinutes).toBe(0);
  });
});

describe('R2-173 busy carry-over', () => {
  const carried = { id: 'wa-9', employeeId: 'e1', machineAllocationId: 'ma-9', machineAllocation: { machine: { id: 'm1', name: 'SM-74' }, order: { orderNumber: 'ORD-1' } }, jobPhase: null };

  it('still clocked in with a live task from shift 1 shows busy in shift 2', async () => {
    wa.mockImplementation(async ({ where }: Row) => (where.shiftId?.not ? [carried] : []));
    const rows = await alloc.getWorkerAvailability('s2', '2026-10-13');
    expect(rows[0].allocations.map((a) => a.id)).toEqual(['wa-9']);
  });

  it('still clocked in with no task stays available', async () => {
    wa.mockResolvedValue([]);
    const rows = await alloc.getWorkerAvailability('s2', '2026-10-13');
    expect(rows[0].allocations).toEqual([]);
    expect(rows[0].clockedIn).toBe(true);
  });

  it('clocked out: no carry-over lookup', async () => {
    store.att[0].clockOut = new Date('2026-10-13T08:30:00Z');
    wa.mockImplementation(async ({ where }: Row) => (where.shiftId?.not ? [carried] : []));
    const rows = await alloc.getWorkerAvailability('s2', '2026-10-13');
    expect(rows[0].allocations).toEqual([]);
  });
});
