'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { closePayrollPeriod, recordPayrollExport } from '@/server/mis/payroll-period';
import { releasePayslips, withdrawPayslipRelease } from '@/server/mis/payslips';

/** W9's "Close this month" — Owner only (the server function gates it); irreversible in effect. */
export async function closePayrollPeriodAction(year: number, month: number, overrideReason?: string) {
  return asResult(async () => {
    await closePayrollPeriod(year, month, overrideReason ? { reason: overrideReason } : undefined);
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
