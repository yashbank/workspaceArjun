import { isUuid } from '@/lib/mis/ids';
import { PrintButton } from '@/components/mis/print/print-button';
import { PayslipSheet } from '@/components/mis/print/payslip-sheet';
import { requireMisAccess } from '@/server/mis/guard';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { calculateEmployeePayroll } from '@/server/mis/payroll';
import { getEmployee } from '@/server/mis/employee';
import { getMisRole } from '@/server/mis/roles';
import { notFound } from 'next/navigation';
import { DEFAULT_FACTORY_TIMEZONE, zonedParts } from '@/lib/mis/factory-time';

export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: { year?: string; month?: string };
}) {
  const { employeeId } = await params;
  // A malformed id is a 404 before anything is fetched (F-25), never a database error.
  if (!isUuid(employeeId)) notFound();
  const sp = await searchParams;
  const user = await requireMisAccess();
  // A payslip is a wage: Owner only (S9 / D24). The server functions below refuse too — this is
  // the page's own line, so its gate no longer depends on which permission payroll happens to use.
  if (!can(await getMisRole(user.id), 'wages.read')) throw new MisForbiddenError('wages.read');

  // R3 B49: year and month are clamped; anything that is not a real month is a 404.
  const today = zonedParts(new Date(), DEFAULT_FACTORY_TIMEZONE);
  const year = sp.year === undefined ? today.year : Number(sp.year);
  const month = sp.month === undefined ? today.month : Number(sp.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) notFound();

  // R2-112: only this employee's line is computed, never the whole factory's payroll.
  const [employee, payroll] = await Promise.all([
    getEmployee(employeeId, 'payslip'),
    calculateEmployeePayroll(employeeId, year, month),
  ]);

  if (!employee) notFound();

  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';

  // The document itself is the shared sheet (also used by the bulk print and the employee's own
  // released slip, R2-109 / R2-111), so all three print the same layout.
  return (
    <div>
      <PayslipSheet companyName={companyName} employee={employee} payroll={payroll} year={year} month={month} generatedAt={new Date()} />
      <div className="mt-6 text-center no-print">
        <PrintButton />
      </div>
    </div>
  );
}
