import { notFound } from 'next/navigation';

import { PayslipSheet } from '@/components/mis/print/payslip-sheet';
import { PrintButton } from '@/components/mis/print/print-button';
import { requireMisAccess } from '@/server/mis/guard';
import { getMyPayslip } from '@/server/mis/payslips';

/**
 * R2-111 — the signed-in employee's OWN payslip for a month the Owner sent them. Previous months
 * only; anything else (not sent, current month, someone else's) is a 404 — the server function
 * takes the employee from the login, never from the URL, so there is no id here to change.
 */
export default async function MyPayslipPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  await requireMisAccess();
  const year = Number(sp.year);
  const month = Number(sp.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) notFound();

  const slip = await getMyPayslip(year, month);
  if (!slip) notFound();

  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';
  return (
    <div>
      <PayslipSheet companyName={companyName} employee={slip.employee} payroll={slip.row} year={year} month={month} generatedAt={new Date()} />
      <div className="mt-6 text-center no-print">
        <PrintButton />
        <p className="mt-2 text-xs text-slate-500">To download, choose “Save as PDF” in the print window.</p>
      </div>
    </div>
  );
}
