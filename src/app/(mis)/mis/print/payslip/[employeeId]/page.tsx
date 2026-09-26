import { isUuid } from '@/lib/mis/ids';
import { PrintButton } from '@/components/mis/print/print-button';
import { requireMisAccess } from '@/server/mis/guard';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { calculateMonthlyPayroll } from '@/server/mis/payroll';
import { getEmployee } from '@/server/mis/employee';
import { getMisRole } from '@/server/mis/roles';
import { notFound } from 'next/navigation';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

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

  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10);

  const [employee, allPayroll] = await Promise.all([
    getEmployee(employeeId),
    calculateMonthlyPayroll(year, month),
  ]);

  if (!employee) notFound();
  const payroll = allPayroll.find(p => p.employeeId === employeeId);

  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 print:py-4 print:px-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-800">
        <div>
          <div className="text-xl font-bold text-gray-900">{companyName}</div>
          <div className="text-sm text-gray-500">Salary Slip / Pay Stub</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-gray-700">{MONTHS[month - 1]} {year}</div>
          <div className="text-xs text-gray-400">Generated: {new Date().toLocaleDateString('en-IN')}</div>
        </div>
      </div>

      {/* Employee info */}
      <div className="grid grid-cols-2 gap-6 mb-6 p-4 bg-gray-50 rounded-lg">
        <div>
          <div className="text-xs text-gray-500">Employee Name</div>
          <div className="font-semibold text-gray-900">{employee.name}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Employee Code</div>
          <div className="font-semibold text-gray-900 font-mono">{employee.employeeCode}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Designation</div>
          <div className="font-medium text-gray-700">{employee.role.replace(/_/g, ' ')}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Pay Period</div>
          <div className="font-medium text-gray-700">{MONTHS[month - 1]} {year}</div>
        </div>
      </div>

      {/* Attendance summary */}
      {payroll && (
        <>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Attendance Summary</h2>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Working Days', value: payroll.workingDays },
                { label: 'Present', value: payroll.present },
                { label: 'Absent', value: payroll.absent },
                { label: 'Leave', value: payroll.leave },
              ].map(item => (
                <div key={item.label} className="text-center border border-gray-200 rounded-lg py-3">
                  <div className="text-lg font-bold text-gray-900">{item.value}</div>
                  <div className="text-xs text-gray-500">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Earnings & Deductions */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Earnings & Deductions</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-medium text-gray-600">Description</th>
                  <th className="text-right py-2 font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {/* 25.1 — six named rows behind five stored components. BASIC prints as "Salary"
                    for a MONTHLY employee and "Basic Wage" for a DAILY one (a display label on
                    payType, D33) — the underlying figure and toggle are the same either way. A
                    component at 0 (toggled off, or the code sets nothing for it) does not print. */}
                <tr className="border-b border-gray-100">
                  <td className="py-2 text-gray-700">
                    {payroll.payType === 'MONTHLY' ? 'Salary' : `Basic Wage (${payroll.present} day${payroll.present !== 1 ? 's' : ''})`}
                  </td>
                  <td className="py-2 text-right text-gray-900">{fmtCurrency(payroll.basicWage)}</td>
                </tr>
                {payroll.hra > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">HRA</td>
                    <td className="py-2 text-right text-gray-900">{fmtCurrency(payroll.hra)}</td>
                  </tr>
                )}
                {payroll.allowance > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">Allowance</td>
                    <td className="py-2 text-right text-gray-900">{fmtCurrency(payroll.allowance)}</td>
                  </tr>
                )}
                {payroll.otPay > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">Overtime Pay</td>
                    <td className="py-2 text-right text-blue-600">+{fmtCurrency(payroll.otPay)}</td>
                  </tr>
                )}
                {payroll.bonus > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">Bonus</td>
                    <td className="py-2 text-right text-blue-600">+{fmtCurrency(payroll.bonus)}</td>
                  </tr>
                )}
                {payroll.extraPay > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">Extra pay</td>
                    <td className="py-2 text-right text-blue-600">+{fmtCurrency(payroll.extraPay)}</td>
                  </tr>
                )}
                {payroll.latePenalty > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">Late Penalty</td>
                    <td className="py-2 text-right text-red-600">−{fmtCurrency(payroll.latePenalty)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-gray-300">
                  <td className="py-3 font-bold text-gray-900">NET SALARY</td>
                  <td className="py-3 text-right font-bold text-gray-900 text-base">{fmtCurrency(payroll.grossPay)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {!payroll && (
        <div className="text-center py-8 text-gray-400">No attendance data for this period.</div>
      )}

      {/* Signature block */}
      <div className="grid grid-cols-2 gap-8 mt-12 pt-6 border-t border-gray-200">
        <div>
          <div className="h-10" />
          <div className="border-t border-gray-400 pt-2 text-xs text-gray-500 text-center">Employee Signature</div>
        </div>
        <div>
          <div className="h-10" />
          <div className="border-t border-gray-400 pt-2 text-xs text-gray-500 text-center">Authorized Signatory</div>
        </div>
      </div>

      {/* Print button */}
      <div className="mt-6 text-center no-print">
        <PrintButton />
      </div>
    </div>
  );
}
