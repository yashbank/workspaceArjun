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
const payComponents = await import('./pay-components');
const extraPayDays = await import('./extra-pay-days');
const payrollPeriod = await import('./payroll-period');
const payrollLedger = await import('./payroll-ledger');
const supplierInvoice = await import('./supplier-invoice');
const grn = await import('./grn');
const po = await import('./po');
const store = await import('./store');
const materialRequest = await import('./material-request');
const pickList = await import('./pick-list');
const storeReturn = await import('./store-return');
const leavePay = await import('./leave-pay');

type Entry = { module: string; name: string; requires: MisAction; call: () => Promise<unknown> };

const RANGE = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };
const EMPLOYEE_INPUT = { employeeCode: 'E-9', name: 'X', role: 'WORKER' } as never;

const TABLE: Entry[] = [
  { module: 'employee.ts', name: 'listEmployees', requires: 'employees.read', call: () => employee.listEmployees() },
  // R2-83: the paged list — same door as the full list.
  { module: 'employee.ts', name: 'listEmployeesPage', requires: 'employees.read', call: () => employee.listEmployeesPage() },
  { module: 'employee.ts', name: 'listEmployeeRoster', requires: 'employees.read', call: () => employee.listEmployeeRoster() },
  { module: 'employee.ts', name: 'getEmployee', requires: 'employees.read', call: () => employee.getEmployee('e1') },
  { module: 'employee.ts', name: 'createEmployee', requires: 'employees.write', call: () => employee.createEmployee(EMPLOYEE_INPUT) },
  { module: 'employee.ts', name: 'updateEmployee', requires: 'employees.write', call: () => employee.updateEmployee('e1', {}) },
  { module: 'employee.ts', name: 'deleteEmployee', requires: 'employees.write', call: () => employee.deleteEmployee('e1') },
  { module: 'employee.ts', name: 'setEmployeeActive', requires: 'employees.write', call: () => employee.setEmployeeActive('e1', false) },
  { module: 'employee.ts', name: 'restoreEmployee', requires: 'employees.write', call: () => employee.restoreEmployee('e1') },
  { module: 'employee.ts', name: 'importEmployeesCsv', requires: 'employees.write', call: () => employee.importEmployeesCsv([{ employeeCode: 'E-9', name: 'X' }]) },

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
  { module: 'wage-type.ts', name: 'getWageTypeRowsForCodes', requires: 'wages.read', call: () => wageType.getWageTypeRowsForCodes(['WG-DAILY-01']) },
  { module: 'wage-type.ts', name: 'updateWageTypeDetails', requires: 'wages.read', call: () => wageType.updateWageTypeDetails('WG-DAILY-01', { name: 'X' }) },
  { module: 'wage-type.ts', name: 'listWageRateHistory', requires: 'wages.read', call: () => wageType.listWageRateHistory('2026-01-01') },

  { module: 'business-rules.ts', name: 'getBusinessRules', requires: 'settings.read', call: () => rules.getBusinessRules() },
  { module: 'business-rules.ts', name: 'updateBusinessRule', requires: 'settings.write', call: () => rules.updateBusinessRule('k', 'v') },
  { module: 'business-rules.ts', name: 'getWageRuleHistory', requires: 'wages.read', call: () => rules.getWageRuleHistory('DAILY_WAGE_DEFAULT') },
  { module: 'business-rules.ts', name: 'getAqlThresholdRules', requires: 'aql.read', call: () => rules.getAqlThresholdRules() },
  { module: 'business-rules.ts', name: 'updateAqlThreshold', requires: 'aql.read', call: () => rules.updateAqlThreshold('AQL_MAJOR_MAX', '1') },
  // D12: scheduling a change to ANY rule is the Owner's (wages.read is the Owner marker, D24/D25).
  { module: 'business-rules.ts', name: 'scheduleBusinessRule', requires: 'wages.read', call: () => rules.scheduleBusinessRule({ ruleKey: 'k', ruleValue: '1', effectiveFrom: '2099-01-01', reason: 'For the test' }) },

  // The payroll figures ARE wages (F-01, fixed in 14F: this used to be gated on attendance.read).
  { module: 'payroll.ts', name: 'calculateMonthlyPayroll', requires: 'wages.read', call: () => payroll.calculateMonthlyPayroll(2026, 1) },
  { module: 'payroll.ts', name: 'getMonthWageBill', requires: 'wages.read', call: () => payroll.getMonthWageBill(2026, 1) },
  { module: 'payroll.ts', name: 'calculateEmployeePayroll', requires: 'wages.read', call: () => payroll.calculateEmployeePayroll('e1', 2026, 1) },
  { module: 'payroll-ledger.ts', name: 'buildWageLedgerCsv', requires: 'wages.read', call: () => payrollLedger.buildWageLedgerCsv(2026, 1) },
  { module: 'payroll-ledger.ts', name: 'buildBankTransferCsv', requires: 'wages.read', call: () => payrollLedger.buildBankTransferCsv(2026, 1) },
  { module: 'payroll-ledger.ts', name: 'listBankDetailGaps', requires: 'wages.read', call: () => payrollLedger.listBankDetailGaps([]) },

  // Phase 25 (25.1) — per-employee payslip-row toggles are wage STRUCTURE, Owner only.
  { module: 'pay-components.ts', name: 'getPayComponents', requires: 'wages.read', call: () => payComponents.getPayComponents('e1') },
  { module: 'pay-components.ts', name: 'getPayComponentsForEmployees', requires: 'wages.read', call: () => payComponents.getPayComponentsForEmployees(['e1']) },
  { module: 'pay-components.ts', name: 'setPayComponent', requires: 'wages.read', call: () => payComponents.setPayComponent('e1', 'HRA', false) },

  // Phase 25 (25.4, D28) — proposing is attendance.write (Admin/Super Attendance Operator, D28's
  // own words); every other door is wages.read, Owner only, from the moment a rupee/multiplier
  // figure can be read back.
  { module: 'extra-pay-days.ts', name: 'proposeExtraPayDay', requires: 'attendance.write', call: () => extraPayDays.proposeExtraPayDay({ date: new Date('2026-01-01'), kind: 'FLAT_AMOUNT', value: 500, scope: 'ALL_PRESENT', reason: 'test' }) },
  { module: 'extra-pay-days.ts', name: 'listDepartmentOptions', requires: 'attendance.write', call: () => extraPayDays.listDepartmentOptions() },
  { module: 'extra-pay-days.ts', name: 'listExtraPayProposals', requires: 'attendance.write', call: () => extraPayDays.listExtraPayProposals() },
  { module: 'extra-pay-days.ts', name: 'withdrawExtraPayProposal', requires: 'attendance.write', call: () => extraPayDays.withdrawExtraPayProposal('x1') },
  { module: 'extra-pay-days.ts', name: 'listExtraPayDays', requires: 'wages.read', call: () => extraPayDays.listExtraPayDays() },
  { module: 'extra-pay-days.ts', name: 'listApprovedExtraPayDaysForMonth', requires: 'wages.read', call: () => extraPayDays.listApprovedExtraPayDaysForMonth(2026, 1) },
  { module: 'extra-pay-days.ts', name: 'approveExtraPayDay', requires: 'wages.read', call: () => extraPayDays.approveExtraPayDay('x1') },
  { module: 'extra-pay-days.ts', name: 'rejectExtraPayDay', requires: 'wages.read', call: () => extraPayDays.rejectExtraPayDay('x1') },
  { module: 'extra-pay-days.ts', name: 'countPendingExtraPayDays', requires: 'wages.read', call: () => extraPayDays.countPendingExtraPayDays() },

  // R2-102 — whether a leave type is PAID moves every payslip: Owner only, read and write.
  { module: 'leave-pay.ts', name: 'getLeavePaySettings', requires: 'wages.read', call: () => leavePay.getLeavePaySettings() },
  { module: 'leave-pay.ts', name: 'setLeavePay', requires: 'wages.read', call: () => leavePay.setLeavePay({ leaveType: 'CL', paid: false }) },
  { module: 'leave-pay.ts', name: 'getLeavePayForMonth', requires: 'wages.read', call: () => leavePay.getLeavePayForMonth(2026, 1) },

  // Phase 25 (D27's missing half) — the period-close/snapshot flow. Every door is wages.read.
  { module: 'payroll-period.ts', name: 'getPayrollPeriod', requires: 'wages.read', call: () => payrollPeriod.getPayrollPeriod(2026, 1) },
  { module: 'payroll-period.ts', name: 'getPayrollPreflight', requires: 'wages.read', call: () => payrollPeriod.getPayrollPreflight(2026, 1) },
  { module: 'payroll-period.ts', name: 'closePayrollPeriod', requires: 'wages.read', call: () => payrollPeriod.closePayrollPeriod(2026, 1) },
  { module: 'payroll-period.ts', name: 'reopenPayrollPeriod', requires: 'wages.read', call: () => payrollPeriod.reopenPayrollPeriod(2026, 1, 'test') },
  { module: 'payroll-period.ts', name: 'recordPayrollCorrection', requires: 'wages.read', call: () => payrollPeriod.recordPayrollCorrection(2026, 1, 'test') },
  { module: 'payroll-period.ts', name: 'recordPayrollExport', requires: 'wages.read', call: () => payrollPeriod.recordPayrollExport(2026, 1) },

  { module: 'reports.ts', name: 'getProductionReport', requires: 'reports.read', call: () => reports.getProductionReport(RANGE) },
  { module: 'reports.ts', name: 'getAttendanceReport', requires: 'reports.read', call: () => reports.getAttendanceReport(RANGE) },
  { module: 'reports.ts', name: 'getQcReport', requires: 'reports.read', call: () => reports.getQcReport(RANGE) },
  { module: 'reports.ts', name: 'getOrdersReport', requires: 'reports.read', call: () => reports.getOrdersReport(RANGE) },
  { module: 'reports.ts', name: 'getStoreReport', requires: 'reports.read', call: () => reports.getStoreReport(RANGE) },
  { module: 'reports.ts', name: 'getWastageReport', requires: 'reports.read', call: () => reports.getWastageReport({ weeks: 4 }) },
  // Phase 21 (D1) — all money, so wages.read like computePoTotal, not reports.read.
  { module: 'reports.ts', name: 'getBufferDriftReport', requires: 'wages.read', call: () => reports.getBufferDriftReport(RANGE) },
  // E7-11 — same door as every other report in this file; no money in the payload (D24).
  { module: 'reports.ts', name: 'getMachineUtilisationReport', requires: 'reports.read', call: () => reports.getMachineUtilisationReport(RANGE) },

  // F6 — the 3-way match board. Read: Owner/Admin/Store Guy; reconcile: Owner/Admin. Rupees stay Owner-only inside the payload.
  { module: 'supplier-invoice.ts', name: 'reconcilePO', requires: 'po.read', call: () => supplierInvoice.reconcilePO('po1') },
  { module: 'supplier-invoice.ts', name: 'listSupplierInvoices', requires: 'supplier_invoice.read', call: () => supplierInvoice.listSupplierInvoices() },
  { module: 'supplier-invoice.ts', name: 'listSupplierInvoicesPage', requires: 'supplier_invoice.read', call: () => supplierInvoice.listSupplierInvoicesPage() },
  // R2-37 — QC may VIEW PO / GRN read-only: po.view / grn.view (QC holds neither po.read nor any write).
  { module: 'grn.ts', name: 'listGRNs', requires: 'grn.view', call: () => grn.listGRNs() },
  { module: 'grn.ts', name: 'listGRNsPage', requires: 'grn.view', call: () => grn.listGRNsPage({}) },
  { module: 'grn.ts', name: 'getGRN', requires: 'grn.view', call: () => grn.getGRN('g1') },
  { module: 'po.ts', name: 'listPOs', requires: 'po.view', call: () => po.listPOs() },
  { module: 'po.ts', name: 'listPOsPage', requires: 'po.view', call: () => po.listPOsPage({}) },
  { module: 'po.ts', name: 'getPO', requires: 'po.view', call: () => po.getPO('p1') },
  // R2-38/62/66/77/79 — Store: a Supervisor reads (store.read) and raises requests/returns; only store.write issues, picks, hands over.
  { module: 'store.ts', name: 'createStoreOut', requires: 'store.write', call: () => store.createStoreOut({ itemId: 'i1', quantity: 1, general: { reason: 'grease', costCenter: 'Press' } }) },
  { module: 'store.ts', name: 'commitIssue', requires: 'store.write', call: () => store.commitIssue([{ itemId: 'i1', qty: 1 }], { general: { reason: 'grease', costCenter: 'Press' } }) },
  { module: 'store.ts', name: 'listItemBalances', requires: 'store.read', call: () => store.listItemBalances() },
  { module: 'store.ts', name: 'listCostCenters', requires: 'store.read', call: () => store.listCostCenters() },
  { module: 'material-request.ts', name: 'createMaterialRequest', requires: 'store.read', call: () => materialRequest.createMaterialRequest([{ itemId: 'i1', qty: 1 }], { general: { reason: 'grease', costCenter: 'Press' } }) },
  { module: 'material-request.ts', name: 'approveMaterialRequest', requires: 'store.write', call: () => materialRequest.approveMaterialRequest('r1', []) },
  { module: 'material-request.ts', name: 'approveMaterialRequestForPicking', requires: 'store.write', call: () => materialRequest.approveMaterialRequestForPicking('r1', []) },
  { module: 'material-request.ts', name: 'rejectMaterialRequest', requires: 'store.write', call: () => materialRequest.rejectMaterialRequest('r1', 'no') },
  { module: 'pick-list.ts', name: 'listPickLists', requires: 'store.read', call: () => pickList.listPickLists() },
  { module: 'pick-list.ts', name: 'getPickList', requires: 'store.read', call: () => pickList.getPickList('p1') },
  { module: 'pick-list.ts', name: 'recordPicks', requires: 'store.write', call: () => pickList.recordPicks('p1', []) },
  { module: 'pick-list.ts', name: 'stagePickList', requires: 'store.write', call: () => pickList.stagePickList('p1') },
  { module: 'pick-list.ts', name: 'handOverPickList', requires: 'store.write', call: () => pickList.handOverPickList('p1') },
  { module: 'store-return.ts', name: 'createStoreReturn', requires: 'store.read', call: () => storeReturn.createStoreReturn({ itemId: 'i1', qty: 1, reason: 'unused' }) },
  { module: 'store-return.ts', name: 'decideStoreReturn', requires: 'store.write', call: () => storeReturn.decideStoreReturn('r1', 'ACCEPT') },
  { module: 'store-return.ts', name: 'listStoreReturns', requires: 'store.read', call: () => storeReturn.listStoreReturns() },
  { module: 'supplier-invoice.ts', name: 'reconcileSupplierInvoice', requires: 'supplier_invoice.write', call: () => supplierInvoice.reconcileSupplierInvoice('i1') },
];

/** Functions in these modules deliberately not in TABLE: ungated internals (see server-gates.test.ts). */
const NOT_A_DOOR: Record<string, string[]> = {
  'employee.ts': [],
  'users.ts': [],
  'wage-type.ts': [],
  'business-rules.ts': ['getOfflineRules', 'getFactoryTimezone', 'getCorrectionWindowDays', 'getRuleValue', 'getLineClearanceRule', 'getAqlThresholds', 'getPoApprovalThreshold'],
  'payroll.ts': [],
  'reports.ts': [],
  'pay-components.ts': [],
  'extra-pay-days.ts': [],
  'payroll-period.ts': [],
  'payroll-ledger.ts': [],
  'leave-pay.ts': [],
  'supplier-invoice.ts': [],
  // R2 batch 2 — the Store flow modules are fully tabled (every async export is a door).
  'pick-list.ts': [],
  'store-return.ts': [],
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
