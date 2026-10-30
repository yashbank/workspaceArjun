import { beforeEach, describe, expect, it, vi } from 'vitest';

/** R2 round 6 — F1 (F11 (R2-251) bulk IN stores shift, F13 (R2-253) admin operator role. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory rows
type Row = Record<string, any>;
const store = { employees: [] as Row[], attendance: [] as Row[], created: [] as Row[] };

const fakeDb: Row = {
  misEmployee: {
    findMany: async ({ where }: Row) => store.employees.filter((e) => (!where.id?.in || where.id.in.includes(e.id)) && e.isActive),
  },
  misAttendance: {
    findMany: async () => [],
    upsert: async ({ create }: Row) => {
      store.created.push(create);
      return { ...create, id: 'att-1' };
    },
  },
  misPayrollPeriod: { findUnique: async () => null },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
};
vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'SUPER_ATTENDANCE_OPERATOR' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getCorrectionWindowDays: async () => 30,
  getLunchBreakMinutes: async () => 30,
}));
vi.mock('@/server/mis/shift-roster', () => ({
  resolveEmployeeShiftId: async (_e: string, _d: string, _c: unknown, def?: string | null) => def ?? null,
}));

const kiosk = await import('./kiosk-device');
const att = await import('./attendance');

beforeEach(() => {
  store.created = [];
  store.employees = [
    { id: 'a', employeeCode: 'A', name: 'A', photoUrl: null, role: 'WORKER', isActive: true, defaultShiftId: null },
    { id: 'b', employeeCode: 'B', name: 'B', photoUrl: null, role: 'WORKER', isActive: true, defaultShiftId: 's1' },
  ];
});

describe('R2-253 operatorRoleOf', () => {
  it('maps ADMIN and OWNER to SUPER_OPERATOR', () => {
    expect(kiosk.operatorRoleOf('ADMIN')).toBe('SUPER_OPERATOR');
    expect(kiosk.operatorRoleOf('OWNER')).toBe('SUPER_OPERATOR');
    expect(kiosk.operatorRoleOf('WORKER')).toBeNull();
  });
});

describe('R2-251 bulkPunch IN stores the shift', () => {
  it('stores the default shift on the created row', async () => {
    await att.bulkPunch('IN', ['b']);
    expect(store.created[0]).toMatchObject({ employeeId: 'b', shiftId: 's1' });
  });
});
