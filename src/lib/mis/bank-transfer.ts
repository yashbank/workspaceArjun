/**
 * R2-110 — the month-end BANK TRANSFER file, laid out from rows the server already computed. Pure:
 * no Prisma, no React. The amount per line is the payroll row's gross pay as-is (payroll already
 * rounds it to whole rupees); this only writes it with two decimals, the way bank bulk-upload
 * sheets expect, and adds totals in whole paise so a long list never drifts by a rounding error.
 *
 * An employee with no bank details on file, or details that do not validate, is SKIPPED and listed
 * by name — never written as a half line the bank would reject (or worse, credit to a wrong account).
 */

import { normaliseBankDetails } from './bank-details';
import type { Cell } from './wastage-csv';

export type BankTransferPay = { employeeId: string; employeeCode: string; employeeName: string; grossPay: number };
export type BankTransferAccount = { id: string; bankName: string | null; bankAccountNo: string | null; ifsc: string | null };
export type BankTransferSkip = { employeeId: string; employeeCode: string; employeeName: string; reason: string };

export const BANK_TRANSFER_HEADERS = ['Beneficiary Name', 'Account Number', 'IFSC', 'Bank Name', 'Amount', 'Employee Code', 'Narration'] as const;

export const NO_BANK_DETAILS = 'No bank account or IFSC on file';
export const BAD_BANK_DETAILS = 'Bank details on file are not valid';

/** Whole paise, so sums are exact integers. */
export const toPaise = (rupees: number): number => Math.round(rupees * 100);
/** "2270.00" — two decimals, no grouping, no currency sign. */
export const paiseToAmount = (paise: number): string => `${Math.trunc(paise / 100)}.${String(Math.abs(paise) % 100).padStart(2, '0')}`;

/** Why this employee cannot be paid by transfer, or null when their details are usable. */
export function bankDetailsProblem(account: BankTransferAccount | undefined): string | null {
  if (!account || (!account.bankAccountNo && !account.ifsc)) return NO_BANK_DETAILS;
  try {
    const clean = normaliseBankDetails({ bankName: account.bankName, bankAccountNo: account.bankAccountNo, ifsc: account.ifsc });
    return clean.bankAccountNo && clean.ifsc ? null : NO_BANK_DETAILS;
  } catch {
    return BAD_BANK_DETAILS;
  }
}

export type BankTransferFile = {
  /** Header + one row per payable employee. */
  rows: Cell[][];
  payableCount: number;
  totalPaise: number;
  skipped: BankTransferSkip[];
  /** Employees with nothing to pay this month (gross 0) — left out of the file, not an error. */
  zeroPayCount: number;
};

export function buildBankTransfer(pay: readonly BankTransferPay[], accounts: ReadonlyMap<string, BankTransferAccount>, narration: string): BankTransferFile {
  const sorted = [...pay].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  const rows: Cell[][] = [[...BANK_TRANSFER_HEADERS]];
  const skipped: BankTransferSkip[] = [];
  let totalPaise = 0;
  let zeroPayCount = 0;

  for (const p of sorted) {
    const paise = toPaise(p.grossPay);
    if (paise <= 0) {
      zeroPayCount += 1;
      continue;
    }
    const account = accounts.get(p.employeeId);
    const problem = bankDetailsProblem(account);
    if (problem || !account) {
      skipped.push({ employeeId: p.employeeId, employeeCode: p.employeeCode, employeeName: p.employeeName, reason: problem ?? NO_BANK_DETAILS });
      continue;
    }
    const clean = normaliseBankDetails({ bankName: account.bankName, bankAccountNo: account.bankAccountNo, ifsc: account.ifsc });
    rows.push([p.employeeName, clean.bankAccountNo, clean.ifsc, clean.bankName, paiseToAmount(paise), p.employeeCode, narration]);
    totalPaise += paise;
  }

  return { rows, payableCount: rows.length - 1, totalPaise, skipped, zeroPayCount };
}

/** Everyone on the list whose details would keep them out of the transfer file (for the screen). */
export function bankDetailGaps(
  people: readonly { employeeId: string; employeeCode: string; employeeName: string }[],
  accounts: ReadonlyMap<string, BankTransferAccount>,
): BankTransferSkip[] {
  return people
    .map((p) => ({ ...p, reason: bankDetailsProblem(accounts.get(p.employeeId)) }))
    .filter((p): p is BankTransferSkip => p.reason !== null)
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
}
