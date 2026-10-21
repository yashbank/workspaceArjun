import { beforeEach, describe, expect, it, vi } from 'vitest';

/** R2-86/94/95/96/103/115: db-free checks of the attendance + employee fixes. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory rows
type Row = Record<string, any>;
const store = { attendance: [] as Row[], employees: [] as Row[], depts: [{ id: 'd1' }] as Row[], created: [] as Row[] };
const t = (s: string) => new Date(`${s}T00:00:00Z`);

const fakeDb: Row = {
  misAttendance: {
    findMany: async ({ where }: Row) => store.attendance.filter((r) => r.date.getTime() === where.date.getTime() && (where.lateMinutes ? r.lateMinutes > 0 : true)),
    findUnique: async ({ where }: Row) => store.attendance.find((r) => r.id === where.id) ?? null,
    update: async ({ where, data }: Row) => Object.assign(store.attendance.find((r) => r.id === where.id)!, data),
  },
  misEmployee: {
    findMany: async ({ where }: Row) => {
      const hasRow = (e: Row) => store.attendance.some((r) => r.employeeId === e.id && r.date.getTime() === where.attendance.none.date.getTime());
      return store.employees.filter((e) => e.isActive && !e.deletedAt && !hasRow(e));
    },
    findUnique: async ({ where }: Row) => store.employees.find((e) => e.id === where.id) ?? null,
    create: async ({ data }: Row) => { const r = { id: 'new', ...data }; store.created.push(r); return r; },
    update: async ({ where, data }: Row) => Object.assign(store.employees.find((e) => e.id === where.id)!, data),
  },
  misDepartment: { findFirst: async ({ where }: Row) => store.depts.find((d) => d.id === where.id) ?? null },
  misPayrollPeriod: { findUnique: async () => null },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
};
vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
let role = 'OWNER';
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => role }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata', getCorrectionWindowDays: async () => 3 }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleEmployeeWhere: async () => ({}), wouldCreateManagerCycle: async () => false }));

const att = await import('./attendance');
const emp = await import('./employee');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-13T06:00:00Z'));
  vi.clearAllMocks();
  role = 'OWNER';
  store.attendance = [{ id: 'a1', employeeId: 'e1', date: t('2026-10-13'), status: 'PRESENT', clockIn: new Date('2026-10-13T04:05:00Z'), clockOut: null, lateMinutes: 20, notes: null, editedAt: null }];
  store.employees = [
    { id: 'e1', name: 'Punched', isActive: true, deletedAt: null, role: 'WORKER', departmentId: null, payType: 'DAILY', sundayPaid: false, wageTypeCode: null },
    { id: 'e2', name: 'No badge', isActive: true, deletedAt: null, role: 'WORKER', departmentId: null, payType: 'DAILY', sundayPaid: false, wageTypeCode: null },
    { id: 'e3', name: 'Left', isActive: false, deletedAt: null, role: 'WORKER', departmentId: null, payType: 'DAILY', sundayPaid: false, wageTypeCode: null },
  ];
  store.created = [];
});

describe('R2-94/95 unpunched workers', () => {
  it('lists active employees with no register row for the day', async () => {
    const out = await att.listUnrecordedEmployees('2026-10-13');
    expect(out.map((e) => e.id)).toEqual(['e2']);
  });
});

describe('R2-96 clock times', () => {
  it('reads HH:MM in the factory zone', () => {
    expect(att.factoryTimeToInstant('2026-10-13', '09:00', 'Asia/Kolkata').toISOString()).toBe('2026-10-13T03:30:00.000Z');
  });
  it('editAttendance sets clock-in from a time and refuses out <= in on the same shift', async () => {
    const rec = await att.editAttendance('a1', { clockInTime: '09:00', clockOutTime: '17:30' });
    expect(rec.clockIn!.toISOString()).toBe('2026-10-13T03:30:00.000Z');
    expect(rec.clockOut!.toISOString()).toBe('2026-10-13T12:00:00.000Z');
  });
  it('a clock-out earlier than the clock-in rolls to the next day (night shift)', async () => {
    const rec = await att.editAttendance('a1', { clockInTime: '22:00', clockOutTime: '06:00' });
    expect(rec.clockOut!.toISOString()).toBe('2026-10-14T00:30:00.000Z');
  });
});

describe('R2-103 waive lateness', () => {
  it('is refused server-side without attendance.write (QC) and touches nothing', async () => {
    role = 'QC';
    await expect(att.waiveLateness('bus strike')).rejects.toThrow();
    expect(store.attendance[0].lateMinutes).toBe(20);
    expect(audit).not.toHaveBeenCalled();
  });
  it('needs a reason', async () => {
    await expect(att.waiveLateness(' ')).rejects.toThrow('reason');
  });
  it('zeroes late minutes, notes why, and audits', async () => {
    const out = await att.waiveLateness('bus strike');
    expect(out.count).toBe(1);
    expect(store.attendance[0]).toMatchObject({ lateMinutes: 0, notes: 'Lateness waived: bus strike', editedAt: null }); // not frozen against later punches
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'WAIVE_LATENESS' }));
  });
});

describe('R2-86 department on employee', () => {
  it('createEmployee persists departmentId', async () => {
    await emp.createEmployee({ employeeCode: 'x1', name: 'New', departmentId: 'd1' });
    expect(store.created[0].departmentId).toBe('d1');
  });
  it('updateEmployee persists and clears it, and refuses an unknown department', async () => {
    await emp.updateEmployee('e2', { departmentId: 'd1' });
    expect(store.employees[1].departmentId).toBe('d1');
    await emp.updateEmployee('e2', { departmentId: null });
    expect(store.employees[1].departmentId).toBeNull();
    await expect(emp.updateEmployee('e2', { departmentId: 'nope' })).rejects.toThrow('Department not found');
  });
});
