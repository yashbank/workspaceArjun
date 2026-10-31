/** R2-324 — payroll rows carry PF / ESIC / PT / advance / net pay; the ledger and the bank file use them; a closed month freezes them. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMP, fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { calculateMonthlyPayroll } = await import('./payroll');
const { wageLedgerRows, WAGE_LEDGER_HEADERS } = await import('./payroll-ledger');
const { closePayrollPeriod } = await import('./payroll-period');

const setRule = (ruleKey: string, ruleValue: string) => state.rules.push({ id: `r-${ruleKey}`, ruleKey, ruleValue, effectiveFrom: new Date('2020-01-01T00:00:00Z') });

beforeEach(() => {
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-324 deductions on the payroll row', () => {
  it('default rules: PF 12% of basic, ESIC 0.75% of gross (under the ceiling), no PT under 10,000; net = gross less them', async () => {
    const row = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!;
    expect(row.grossPay).toBe(2270);
    expect(row.pf).toBe(Math.round(row.basicWage * 0.12));
    expect(row.esic).toBe(Math.round(row.grossPay * 0.0075));
    expect(row.pt).toBe(0);
    expect(row.advance).toBe(0);
    expect(row.netPay).toBe(row.grossPay - row.pf - row.esic);
  });
  it('the Owner’s rules change the rates; an advance recorded for the month is recovered', async () => {
    setRule('salary.pf_percent', '10');
    setRule('salary.esic_percent', '0');
    state.salaryAdvances.push({ id: 'adv1', employeeId: EMP.id, year: 2026, month: 1, amount: 500 }, { id: 'adv2', employeeId: EMP.id, year: 2026, month: 2, amount: 9999 });
    const row = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!;
    expect(row.pf).toBe(Math.round(row.basicWage * 0.1));
    expect(row.esic).toBe(0);
    expect(row.advance).toBe(500); // only January's
    expect(row.netPay).toBe(row.grossPay - row.pf - 500);
  });
  it('the wage ledger CSV carries the deduction columns and Net Pay', async () => {
    const rows = await calculateMonthlyPayroll(2026, 1);
    const csvRows = wageLedgerRows(rows);
    expect([...WAGE_LEDGER_HEADERS].slice(-5)).toEqual(['PF', 'ESIC', 'PT', 'Advance', 'Net Pay']);
    const asha = csvRows.find((r) => r[0] === 'E-001')!;
    expect(asha.slice(-5)).toEqual([rows[0].pf, rows[0].esic, rows[0].pt, rows[0].advance, rows[0].netPay].map((v) => v));
  });
  it('closing the month freezes the deductions: a rule change afterwards does not move the net', async () => {
    state.salaryAdvances.push({ id: 'adv1', employeeId: EMP.id, year: 2026, month: 1, amount: 300 });
    const live = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!;
    await closePayrollPeriod(2026, 1);
    setRule('salary.pf_percent', '50');
    const frozen = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!;
    expect(frozen).toMatchObject({ pf: live.pf, esic: live.esic, pt: live.pt, advance: 300, netPay: live.netPay });
  });
  it('a line closed BEFORE the deduction columns existed is completed from the rules, so the bank file is never gross', async () => {
    await closePayrollPeriod(2026, 1);
    for (const line of state.payrollSnapshotLines) { delete line.pf; delete line.esic; delete line.pt; delete line.advance; delete line.netPay; }
    const row = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!;
    expect(row.netPay).toBe(row.grossPay - Math.round(row.basicWage * 0.12) - Math.round(row.grossPay * 0.0075));
  });
});
