import { bankDetailGaps, buildBankTransfer, type BankTransferAccount, type BankTransferSkip } from '@/lib/mis/bank-transfer';
import { toCsv, type Cell } from '@/lib/mis/wastage-csv';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/mis/audit';
import { requirePermission } from '@/server/mis/auth';
import { calculateMonthlyPayroll, type PayrollRow } from '@/server/mis/payroll';

/**
 * R2-110 — the month's WAGE LEDGER as CSV: the rupee figures finance needs to pay people, from the
 * SAME `calculateMonthlyPayroll` rows the payslips print (so a CLOSED month exports its frozen
 * snapshot). Owner only (`wages.read`, S9 / D24). The payroll SCREEN stays counts-only (W9) — this
 * file is streamed by a route handler, never sent as screen props.
 *
 * The export is audited with who / which month / how many lines — never a money figure, since
 * non-owners can read audit payloads back.
 *
 * The BANK TRANSFER file (R2-110, batch #2) is `buildBankTransferCsv` below: same rows, plus each
 * employee's bank account / IFSC.
 */

export const WAGE_LEDGER_HEADERS = [
  'Code', 'Employee', 'Pay Type', 'Wage Code', 'Present Days', 'Half Days', 'Late Minutes', 'OT Minutes',
  'Basic', 'HRA', 'Allowance', 'OT Pay', 'Bonus', 'Extra Pay', 'Late Penalty', 'Gross Pay',
] as const;

export function wageLedgerRows(rows: readonly PayrollRow[]): Cell[][] {
  const sorted = [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const body: Cell[][] = sorted.map((r) => [
    r.employeeCode, r.employeeName, r.payType, r.wageTypeCode, r.present, r.halfDay, r.totalLateMinutes, r.totalOTMinutes,
    r.basicWage, r.hra, r.allowance, r.otPay, r.bonus, r.extraPay, r.latePenalty, r.grossPay,
  ]);
  const sum = (pick: (r: PayrollRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const total: Cell[] = [
    'TOTAL', `${rows.length} employees`, null, null, null, null, null, null,
    sum((r) => r.basicWage), sum((r) => r.hra), sum((r) => r.allowance), sum((r) => r.otPay),
    sum((r) => r.bonus), sum((r) => r.extraPay), sum((r) => r.latePenalty), sum((r) => r.grossPay),
  ];
  return [[...WAGE_LEDGER_HEADERS], ...body, total];
}

export async function buildWageLedgerCsv(year: number, month: number): Promise<{ filename: string; csv: string }> {
  const actor = await requirePermission('wages.read');
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Choose a real month to export.');
  }
  const rows = await calculateMonthlyPayroll(year, month);

  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.wageLedgerExport',
    entity: 'MisPayrollPeriod',
    entityId: null,
    after: { year, month, lines: rows.length },
  });

  return { filename: `wage-ledger-${year}-${String(month).padStart(2, '0')}.csv`, csv: toCsv(wageLedgerRows(rows)) };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function assertRealMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('Choose a real month to export.');
  }
}

/** Bank fields for a set of employees, in ONE query. Called only after a `wages.read` gate. */
async function bankAccountsFor(employeeIds: string[]): Promise<Map<string, BankTransferAccount>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await db.misEmployee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, bankName: true, bankAccountNo: true, ifsc: true },
  });
  return new Map(rows.map((r) => [r.id, { id: r.id, bankName: r.bankName ?? null, bankAccountNo: r.bankAccountNo ?? null, ifsc: r.ifsc ?? null }]));
}

/**
 * R2-110 — the month's BANK TRANSFER CSV: one line per employee with pay to receive, carrying their
 * account number, IFSC and the gross pay from the SAME single `calculateMonthlyPayroll` run the
 * ledger and payslips use (a CLOSED month exports its frozen figures). Owner only (`wages.read`).
 *
 * Employees with no (or invalid) bank details are left out and returned in `skipped` so the Owner
 * can pay them another way; the route reports how many. The audit row carries counts only — never
 * an amount and never an account number.
 */
export async function buildBankTransferCsv(
  year: number,
  month: number,
): Promise<{ filename: string; csv: string; skipped: BankTransferSkip[]; payableCount: number }> {
  const actor = await requirePermission('wages.read');
  assertRealMonth(year, month);
  const rows = await calculateMonthlyPayroll(year, month);
  const accounts = await bankAccountsFor(rows.map((r) => r.employeeId));
  const file = buildBankTransfer(rows, accounts, `Salary ${MONTH_NAMES[month - 1]} ${year}`);

  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.bankTransferExport',
    entity: 'MisPayrollPeriod',
    entityId: null,
    after: { year, month, lines: file.payableCount, skipped: file.skipped.length, zeroPay: file.zeroPayCount },
  });

  return {
    filename: `bank-transfer-${year}-${String(month).padStart(2, '0')}.csv`,
    csv: toCsv(file.rows),
    skipped: file.skipped,
    payableCount: file.payableCount,
  };
}

/**
 * R2-110 — who would be left out of the bank transfer file, for the payroll screen. Owner only.
 * Takes the ids the page already has from its payroll run (no second run). Returns names, codes and
 * a reason — never an account number, never money.
 */
export async function listBankDetailGaps(people: { employeeId: string; employeeCode: string; employeeName: string }[]): Promise<BankTransferSkip[]> {
  await requirePermission('wages.read');
  const accounts = await bankAccountsFor(people.map((p) => p.employeeId));
  return bankDetailGaps(people, accounts);
}
