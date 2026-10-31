'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { closePayrollPeriod, recordPayrollExport, reopenPayrollPeriod } from '@/server/mis/payroll-period';
import { releasePayslips, withdrawPayslipRelease } from '@/server/mis/payslips';
import { deleteSalaryAdvance, recordSalaryAdvance } from '@/server/mis/salary-advance';

/** W9's "Close this month" — Owner only (the server function gates it); irreversible in effect. */
export async function closePayrollPeriodAction(year: number, month: number, overrideReason?: string) {
  return asResult(async () => {
    await closePayrollPeriod(year, month, overrideReason ? { reason: overrideReason } : undefined);
    revalidatePath('/mis/payroll');
  }, { entity: 'Payroll period' });
}

/** R2-175: the Owner unfreezes a closed month, with a reason (server-gated and audited). */
export async function reopenPayrollPeriodAction(year: number, month: number, reason: string) {
  return asResult(async () => {
    await reopenPayrollPeriod(year, month, reason);
    revalidatePath('/mis/payroll');
  }, { entity: 'Payroll period' });
}

/** W9: "every export is logged with who and when." Records the event; the file itself is built client-side from counts already on the page. */
export async function recordPayrollExportAction(year: number, month: number) {
  return asResult(async () => {
    await recordPayrollExport(year, month);
    revalidatePath('/mis/payroll');
  }, { entity: 'Payroll period' });
}

/** R2-111: send a closed month's payslips — to these employees, or to everyone when omitted. Owner only (server-gated). */
export async function releasePayslipsAction(year: number, month: number, employeeIds?: string[]) {
  return asResult(async () => {
    const r = await releasePayslips(year, month, employeeIds);
    revalidatePath('/mis/payroll');
    return r;
  }, { entity: 'Payslip' });
}

/** R2-111: take a sent payslip back. Owner only (server-gated). */
export async function withdrawPayslipAction(employeeId: string, year: number, month: number) {
  return asResult(async () => {
    await withdrawPayslipRelease(employeeId, year, month);
    revalidatePath('/mis/payroll');
  }, { entity: 'Payslip' });
}

/** R2-324: salary advances to recover this month (Owner only; the server gates on wages.read). */
export async function recordSalaryAdvanceAction(input: { employeeId: string; year: number; month: number; amount: number; notes?: string | null }) {
  return asResult(async () => {
    const out = await recordSalaryAdvance(input);
    revalidatePath('/mis/payroll/advances');
    revalidatePath('/mis/payroll');
    return out;
  });
}
export async function deleteSalaryAdvanceAction(id: string) {
  return asResult(async () => {
    await deleteSalaryAdvance(id);
    revalidatePath('/mis/payroll/advances');
    revalidatePath('/mis/payroll');
  });
}
