import { notFound } from 'next/navigation';

import { PayslipSheet } from '@/components/mis/print/payslip-sheet';
import { PrintButton } from '@/components/mis/print/print-button';
import { DEFAULT_FACTORY_TIMEZONE, zonedParts } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { getPayslipBatch } from '@/server/mis/payslips';
import { getMisRole } from '@/server/mis/roles';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * R2-109 — every payslip of a month in one print run (one sheet each), for the Owner to print or
 * save as one PDF. Built from ONE payroll run (`getPayslipBatch`), never a recompute per employee.
 */
export default async function BulkPayslipPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await requireMisAccess();
  // Payslips are wages: Owner only (S9 / D24). The server function refuses too.
  if (!can(await getMisRole(user.id), 'wages.read')) throw new MisForbiddenError('wages.read');

  const today = zonedParts(new Date(), DEFAULT_FACTORY_TIMEZONE);
  const year = sp.year === undefined ? today.year : Number(sp.year);
  const month = sp.month === undefined ? today.month : Number(sp.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) notFound();

  const slips = await getPayslipBatch(year, month);
  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';
  const generatedAt = new Date();

  return (
    <div>
      <div className="no-print mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 pt-6">
        <p className="text-sm text-slate-600">
          {slips.length} payslip{slips.length === 1 ? '' : 's'} · {MONTHS[month - 1]} {year}. Each prints on its own page; choose “Save as PDF” to download them as one file.
        </p>
        {slips.length > 0 && <PrintButton />}
      </div>
      {slips.length === 0 ? (
        <p className="py-16 text-center text-slate-500">No payslips for {MONTHS[month - 1]} {year}.</p>
      ) : (
        slips.map((s, i) => (
          <PayslipSheet
            key={s.employee.id}
            companyName={companyName}
            employee={s.employee}
            payroll={s.row}
            year={year}
            month={month}
            generatedAt={generatedAt}
            pageBreak={i < slips.length - 1}
          />
        ))
      )}
    </div>
  );
}
