/**
 * R3-SEC role matrix (mis-permission-matrix): 8 roles x the seven doors this cluster changed.
 * Expectations come from `permissions.ts` (`can`), never from what the code does today.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

import { fakePeopleDb, seedPeople, world } from './testing/people-world';
import { fakeDb, seedWorld, state } from './testing/wage-world';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose fake rows
type Row = Record<string, any>;
const dbProxy = {
  ...fakeDb,
  misEmployee: fakePeopleDb.misEmployee,
  misWorkerAllocation: fakePeopleDb.misWorkerAllocation,
  misLeaveRequest: { ...fakeDb.misLeaveRequest, findMany: async () => [] },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(dbProxy),
};
vi.mock('@/server/db', () => ({ get db() { return dbProxy; } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const roleUnderTest: { role: MisRoleName } = { role: 'OWNER' };
vi.mock('@/server/mis/roles', () => ({
  getMisRole: async () => roleUnderTest.role,
  getMisEmployee: async () => {
    const id = ({ OWNER: 'e-own', ADMIN: 'e-adm', SUPERVISOR: 'e-supA', QC: 'e-qc', ATTENDANCE_OPERATOR: 'e-att' } as Record<string, string>)[roleUnderTest.role];
    return world.people.find((p) => p.id === id) ?? null;
  },
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const employee = await import('./employee');
const rules = await import('./business-rules');
const { closePayrollPeriod } = await import('./payroll-period');
const { proposeExtraPayDay } = await import('./extra-pay-days');

const FORBIDDEN = /Not permitted/;

const DOORS: { name: string; allowed: (r: MisRoleName) => boolean; call: () => Promise<unknown> }[] = [
  { name: 'createEmployee', allowed: (r) => can(r, 'employees.write'), call: () => employee.createEmployee({ employeeCode: 'M1', name: 'M' }) },
  {
    name: 'updateEmployee(wage field)',
    allowed: (r) => can(r, 'employees.write') && can(r, 'wages.read'),
    call: () => employee.updateEmployee('w1', { wageTypeCode: 'CHANGED' }),
  },
  { name: 'deleteEmployee', allowed: (r) => can(r, 'employees.write'), call: () => employee.deleteEmployee('w1') },
  { name: 'getEmployee(out-of-pool)', allowed: (r) => can(r, 'employees.read'), call: () => employee.getEmployee('w3') },
  {
    name: 'updateBusinessRule(threshold)',
    allowed: (r) => can(r, 'settings.write') && can(r, 'wages.read'),
    call: () => rules.updateBusinessRule('po_approval_threshold', '5000'),
  },
  { name: 'closePayrollPeriod', allowed: (r) => can(r, 'wages.read'), call: () => closePayrollPeriod(2026, 1) },
  {
    name: 'proposeExtraPayDay',
    allowed: (r) => can(r, 'attendance.write'),
    call: () => proposeExtraPayDay({ date: '2026-03-10', kind: 'FLAT_AMOUNT', value: 10, scope: 'ALL_PRESENT', reason: 'r' }),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-15T06:00:00Z'));
  seedWorld();
  seedPeople();
  for (const p of world.people) Object.assign(p, { wageTypeCode: 'WG-A', payType: 'DAILY', sundayPaid: false });
  state.rules.push({ id: 'r-po', ruleKey: 'po_approval_threshold', ruleValue: '50000', valueType: 'number', label: 'PO', description: null, effectiveFrom: new Date('2026-01-01'), updatedById: null });
  getCurrentUser.mockResolvedValue({ id: 'u-matrix' });
});

describe('role matrix', () => {
  it('covers exactly MIS_ROLES (a ninth role fails here)', () => {
    expect([...MIS_ROLES]).toEqual(['OWNER', 'ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'STORE_GUY', 'WORKER']);
  });

  describe.each([...MIS_ROLES])('%s', (role) => {
    it.each(DOORS.map((d) => [d.name, d] as const))('%s', async (_name, door) => {
      roleUnderTest.role = role;
      if (door.allowed(role)) {
        // Allowed: whatever happens (success, not-found, validation) it is NOT a permission refusal.
        await door.call().catch((e: Error) => expect(String(e.message)).not.toMatch(FORBIDDEN));
      } else {
        await expect(door.call()).rejects.toThrow(FORBIDDEN);
      }
    });
  });
});

describe('money-key scan: nothing a non-Owner can read carries a wage AMOUNT', () => {
  // `wageTypeCode` is a CODE (D33), the one wage-flavoured key that is allowed; amounts are not.
  const MONEY_KEY = /salary|amount|gross|netpay|\brate|ratePer|₹|wage(?!TypeCode)/i;
  const scan = (value: unknown, path = ''): string[] => {
    if (value === null || value === undefined || value instanceof Date) return [];
    if (Array.isArray(value)) return value.flatMap((v, i) => scan(v, `${path}[${i}]`));
    if (typeof value === 'object') {
      return Object.entries(value as Row).flatMap(([k, v]) => [...(MONEY_KEY.test(k) ? [`${path}.${k}`] : []), ...scan(v, `${path}.${k}`)]);
    }
    return typeof value === 'string' && /₹/.test(value) ? [`${path}=${value}`] : [];
  };

  it.each([...MIS_ROLES].filter((r) => r !== 'OWNER' && can(r, 'employees.read')))(
    '%s: getEmployee and the employees list carry no money key',
    async (role) => {
      roleUnderTest.role = role;
      const one = await employee.getEmployee('w1');
      const list = await employee.listEmployees();
      expect(scan(one)).toEqual([]);
      expect(scan(list)).toEqual([]);
    },
  );
});
