'use server';

import { revalidatePath } from 'next/cache';

import { closePayrollPeriod, recordPayrollExport } from '@/server/mis/payroll-period';

/** W9's "Close this month" — Owner only (the server function gates it); irreversible in effect. */
export async function closePayrollPeriodAction(year: number, month: number) {
  await closePayrollPeriod(year, month);
  revalidatePath('/mis/payroll');
}

/** W9: "every export is logged with who and when." Records the event; the file itself is built client-side from counts already on the page. */
export async function recordPayrollExportAction(year: number, month: number) {
  await recordPayrollExport(year, month);
  revalidatePath('/mis/payroll');
}
