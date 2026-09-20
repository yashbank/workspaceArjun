/**
 * Phase 14 · MIS-37 / MIS-46 / MIS-52 — the permission matrix at the FUNCTION level:
 * every exported server function of the access-and-money modules × all eight roles.
 *
 * `lib/mis/permissions.test.ts` proves which role holds which ACTION. This proves which
 * ACTION each FUNCTION really demands, by calling it as each role and watching for
 * MisForbiddenError — so a function quietly re-gated on the wrong action (F-01 is exactly
 * that) is caught by behaviour, not by reading. The action each function must require is
 * written here by hand; the role side comes from the (separately snapshotted) matrix.
 *
 * The database is a Proxy that answers null to everything: after the gate a function may
 * throw any other error, and that counts as "let in". Only MisForbiddenError means "refused".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { can, type MisAction } from '@/lib/mis/permissions';
import { MIS_ROLES } from '@/lib/mis/roles';

import { exportedFunctions } from './testing/ast';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

// A database that answers null to every call, so the code after the gate runs (or fails) harmlessly.
const nullTable = new Proxy({}, { get: () => async () => null });
const nullDb: Record<string | symbol, unknown> = new Proxy(
  {},
  {
    get: (_t, key) => (key === '$transaction' ? async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : null) : nullTable),
  },
);
vi.mock('@/server/db', () => ({ db: nullDb }));

vi.mock('@/server/users', () => ({ getSeatUsage: async () => ({ used: 1, max: 15 }) }));
vi.mock('@/server/admin', () => ({ inviteUser: async () => undefined }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async () => undefined }));

const employee = await import('./employee');
const users = await import('./users');
const wageType = await import('./wage-type');
const rules = await import('./business-rules');
const payroll = await import('./payroll');
const reports = await import('./reports');

type Entry = { module: string; name: string; requires: MisAction; call: () => Promise<unknown> };

const RANGE = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };
const EMPLOYEE_INPUT = { employeeCode: 'E-9', name: 'X', role: 'WORKER' } as never;

const TABLE: Entry[] = [
  { module: 'employee.ts', name: 'listEmployees', requires: 'employees.read', call: () => employee.listEmployees() },
  { module: 'employee.ts', name: 'listEmployeeRoster', requires: 'employees.read', call: () => employee.listEmployeeRoster() },
  { module: 'employee.ts', name: 'getEmployee', requires: 'employees.read', call: () => employee.getEmployee('e1') },
  { module: 'employee.ts', name: 'createEmployee', requires: 'employees.write', call: () => employee.createEmployee(EMPLOYEE_INPUT) },
  { module: 'employee.ts', name: 'updateEmployee', requires: 'employees.write', call: () => employee.updateEmployee('e1', {}) },
  { module: 'employee.ts', name: 'deleteEmployee', requires: 'employees.write', call: () => employee.deleteEmployee('e1') },
  { module: 'employee.ts', name: 'restoreEmployee', requires: 'employees.write', call: () => employee.restoreEmployee('e1') },

  { module: 'users.ts', name: 'listMisUsers', requires: 'employees.read', call: () => users.listMisUsers() },
  { module: 'users.ts', name: 'getMisSeatSummary', requires: 'employees.read', call: () => users.getMisSeatSummary() },
  { module: 'users.ts', name: 'inviteMisUser', requires: 'users.invite', call: () => users.inviteMisUser('a@example.com', 'QC') },
  { module: 'users.ts', name: 'listPendingMisGrants', requires: 'users.invite', call: () => users.listPendingMisGrants() },
  { module: 'users.ts', name: 'grantMisRole', requires: 'users.invite', call: () => users.grantMisRole('p1', 'QC') },

  { module: 'wage-type.ts', name: 'listWageTypes', requires: 'wages.read', call: () => wageType.listWageTypes() },
  { module: 'wage-type.ts', name: 'listWageCodes', requires: 'wages.read', call: () => wageType.listWageCodes() },
  { module: 'wage-type.ts', name: 'createWageType', requires: 'wages.read', call: () => wageType.createWageType({ name: 'X', unit: 'DAILY', amount: 1 }) },
  { module: 'wage-type.ts', name: 'addWageRate', requires: 'wages.read', call: () => wageType.addWageRate('WG-DAILY-01', 1) },
  { module: 'wage-type.ts', name: 'getWageRateHistory', requires: 'wages.read', call: () => wageType.getWageRateHistory('WG-DAILY-01') },
  { module: 'wage-type.ts', name: 'getWageAmount', requires: 'wages.read', call: () => wageType.getWageAmount('WG-DAILY-01') },
  { module: 'wage-type.ts', name: 'setWageTypeActive', requires: 'wages.read', call: () => wageType.setWageTypeActive('WG-DAILY-01', false) },

  { module: 'business-rules.ts', name: 'getBusinessRules', requires: 'settings.read', call: () => rules.getBusinessRules() },
  { module: 'business-rules.ts', name: 'updateBusinessRule', requires: 'settings.write', call: () => rules.updateBusinessRule('k', 'v') },
  { module: 'business-rules.ts', name: 'getWageRuleHistory', requires: 'wages.read', call: () => rules.getWageRuleHistory('DAILY_WAGE_DEFAULT') },
  { module: 'business-rules.ts', name: 'getAqlThresholdRules', requires: 'aql.read', call: () => rules.getAqlThresholdRules() },
  { module: 'business-rules.ts', name: 'updateAqlThreshold', requires: 'aql.read', call: () => rules.updateAqlThreshold('AQL_MAJOR_MAX', '1') },

  // The payroll figures ARE wages (F-01, fixed in 14F: this used to be gated on attendance.read).
  { module: 'payroll.ts', name: 'calculateMonthlyPayroll', requires: 'wages.read', call: () => payroll.calculateMonthlyPayroll(2026, 1) },
  { module: 'payroll.ts', name: 'getMonthWageBill', requires: 'wages.read', call: () => payroll.getMonthWageBill(2026, 1) },

  { module: 'reports.ts', name: 'getProductionReport', requires: 'reports.read', call: () => reports.getProductionReport(RANGE) },
  { module: 'reports.ts', name: 'getAttendanceReport', requires: 'reports.read', call: () => reports.getAttendanceReport(RANGE) },
  { module: 'reports.ts', name: 'getQcReport', requires: 'reports.read', call: () => reports.getQcReport(RANGE) },
  { module: 'reports.ts', name: 'getOrdersReport', requires: 'reports.read', call: () => reports.getOrdersReport(RANGE) },
  { module: 'reports.ts', name: 'getStoreReport', requires: 'reports.read', call: () => reports.getStoreReport(RANGE) },
];

/** Functions in these modules deliberately not in TABLE: ungated internals (see server-gates.test.ts). */
const NOT_A_DOOR: Record<string, string[]> = {
  'employee.ts': [],
  'users.ts': [],
  'wage-type.ts': [],
  'business-rules.ts': ['getOfflineRules', 'getFactoryTimezone', 'getCorrectionWindowDays', 'getRuleValue', 'getLineClearanceRule', 'getAqlThresholds'],
  'payroll.ts': [],
  'reports.ts': [],
};

async function refused(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return false;
  } catch (e) {
    return (e as Error).name === 'MisForbiddenError';
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('the table is complete', () => {
  it('every exported async function of these modules is either in the table or a named non-door', () => {
    const missing: string[] = [];
    for (const [module, skip] of Object.entries(NOT_A_DOOR)) {
      const fns = exportedFunctions(`src/server/mis/${module}`).filter((f) => f.isAsync).map((f) => f.name);
      for (const name of fns) {
        const tabled = TABLE.some((t) => t.module === module && t.name === name);
        if (!tabled && !skip.includes(name)) missing.push(`${module}#${name}`);
      }
    }
    expect(missing, `add to TABLE (with the action it must demand): ${missing.join(', ')}`).toEqual([]);
  });

  it('nothing in the table has since been deleted', () => {
    const gone = TABLE.filter((t) => !exportedFunctions(`src/server/mis/${t.module}`).some((f) => f.name === t.name));
    expect(gone.map((t) => t.name)).toEqual([]);
  });

  it('covers 8 roles and at least 30 functions (a truncated table would pass vacuously)', () => {
    expect(MIS_ROLES.length).toBe(8);
    expect(TABLE.length).toBeGreaterThanOrEqual(30);
  });
});

describe('function × role — refused exactly when the role does not hold the required action', () => {
  for (const entry of TABLE) {
    describe(`${entry.module} · ${entry.name} requires ${entry.requires}`, () => {
      for (const role of MIS_ROLES) {
        const expectRefused = !can(role, entry.requires);
        const run = async () => {
          getMisRole.mockResolvedValue(role);
          expect(await refused(entry.call)).toBe(expectRefused);
        };
        it(`${role} is ${expectRefused ? 'refused' : 'let through the gate'}`, run);
      }
    });
  }

  it('an anonymous caller and a login with no MIS role are refused by every function', async () => {
    for (const entry of TABLE) {
      getCurrentUser.mockResolvedValueOnce(null);
      expect(await refused(entry.call), `${entry.name} with no session`).toBe(true);
      getCurrentUser.mockResolvedValue({ id: 'u1' });
      getMisRole.mockResolvedValue(null);
      expect(await refused(entry.call), `${entry.name} with no MIS role`).toBe(true);
    }
  });
});
