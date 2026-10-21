/**
 * R2-110 — the bank transfer CSV, end to end through the real payroll at the wage-world rates
 * (731.19 a day, OT ×2.375, late 0.83/min). Owner only; one payroll run; skipped employees listed;
 * the audit row carries counts, never an amount or an account number.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';

import { EMP, fakeDb, findLeaks, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { buildBankTransferCsv, listBankDetailGaps } = await import('./payroll-ledger');

const BALA = { id: 'e2', name: 'Bala', employeeCode: 'E-002' };
const CHITRA = { id: 'e3', name: 'Chitra', employeeCode: 'E-003' };
const rec = (id: string, date: string, employee: object, lateMinutes = 0, otMinutes = 0, status = 'PRESENT') => ({ id, date: new Date(date), status, lateMinutes, otMinutes, employee, shift: { name: 'Day' } });

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  state.attendance = [
    // Asha: gross 2270 (3 × 731.19 + 1.5 h OT 325.61 − 300 min late 249 = 2270.18)
    rec('1', '2026-01-05', EMP, 300, 0), rec('2', '2026-01-06', EMP, 0, 90), rec('3', '2026-01-07', EMP),
    // Bala: 2 half days = 731.19 → 731; no bank details on file
    rec('4', '2026-01-05', BALA, 0, 0, 'HALF_DAY'), rec('5', '2026-01-06', BALA, 0, 0, 'HALF_DAY'),
    // Chitra: absent only → gross 0 → not in the file
    rec('6', '2026-01-05', CHITRA, 0, 0, 'ABSENT'),
  ];
  state.employees = [
    { id: EMP.id, bankName: 'SBI', bankAccountNo: '123456789012', ifsc: 'SBIN0001234' },
    { id: BALA.id, bankName: null, bankAccountNo: null, ifsc: null },
    { id: CHITRA.id, bankName: 'SBI', bankAccountNo: '555566667777', ifsc: 'SBIN0009999' },
  ];
});

describe('buildBankTransferCsv', () => {
  it('writes one exact line per payable employee, skips and lists the one without details, from ONE payroll run', async () => {
    const { filename, csv, skipped, payableCount } = await buildBankTransferCsv(2026, 1);
    expect(filename).toBe('bank-transfer-2026-01.csv');
    expect(state.attendanceWhere).toHaveLength(1);
    expect(payableCount).toBe(1);
    expect(csv).toBe(
      'Beneficiary Name,Account Number,IFSC,Bank Name,Amount,Employee Code,Narration\r\n' +
        'Asha,123456789012,SBIN0001234,SBI,2270.00,E-001,Salary Jan 2026\r\n',
    );
    expect(skipped).toEqual([{ employeeId: 'e2', employeeCode: 'E-002', employeeName: 'Bala', reason: 'No bank account or IFSC on file' }]);
  });

  it('the amount equals the payroll gross pay the payslip prints (same run)', async () => {
    const { calculateMonthlyPayroll } = await import('./payroll');
    const gross = (await calculateMonthlyPayroll(2026, 1)).find((r) => r.employeeId === EMP.id)!.grossPay;
    const { csv } = await buildBankTransferCsv(2026, 1);
    expect(gross).toBe(2270);
    expect(csv).toContain(`,${gross.toFixed(2)},`);
  });

  it('audits who / which month / counts — no amount, no account number, no IFSC', async () => {
    await buildBankTransferCsv(2026, 1);
    const row = state.auditRows.find((r) => r.action === 'payrollPeriod.bankTransferExport');
    expect(row).toMatchObject({ actorId: 'u1', entity: 'MisPayrollPeriod', after: { year: 2026, month: 1, lines: 1, skipped: 1, zeroPay: 1 } });
    expect(findLeaks(row, { keys: /amount|gross|wage|account|ifsc/i, values: ['2270', '2270.00', '123456789012', 'SBIN0001234', '731.19'] })).toEqual([]);
  });

  it('refuses a nonsense month', async () => {
    await expect(buildBankTransferCsv(2026, 0)).rejects.toThrow('Choose a real month to export.');
    await expect(buildBankTransferCsv(Number.NaN, 1)).rejects.toThrow('Choose a real month to export.');
  });

  it.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s is refused (wages.read) and nothing is audited', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(buildBankTransferCsv(2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
    await expect(listBankDetailGaps([{ employeeId: EMP.id, employeeCode: 'E-001', employeeName: 'Asha' }])).rejects.toThrow(/Not permitted: wages\.read/);
    expect(state.auditRows).toEqual([]);
  });
});

describe('listBankDetailGaps', () => {
  it('names the people the file will skip — no account numbers in the result', async () => {
    const gaps = await listBankDetailGaps([
      { employeeId: EMP.id, employeeCode: 'E-001', employeeName: 'Asha' },
      { employeeId: BALA.id, employeeCode: 'E-002', employeeName: 'Bala' },
      { employeeId: 'ghost', employeeCode: 'E-009', employeeName: 'Ghost' },
    ]);
    expect(gaps.map((g) => g.employeeCode)).toEqual(['E-002', 'E-009']);
    expect(JSON.stringify(gaps)).not.toMatch(/123456789012|SBIN/);
  });

  it('an empty list asks the database nothing', async () => {
    expect(await listBankDetailGaps([])).toEqual([]);
  });
});
