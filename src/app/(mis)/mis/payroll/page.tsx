import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { calculateMonthlyPayroll } from '@/server/mis/payroll';
import { getPayrollPeriod, getPayrollPreflight } from '@/server/mis/payroll-period';
import { PayrollScreen } from '@/components/mis/payroll/payroll-screen';

type Props = { searchParams: Promise<{ year?: string; month?: string }> };

export default async function PayrollPage({ searchParams }: Props) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  // Pay figures are wages: Owner only (S9 / D24). The server function refuses too; this is the page's own line.
  if (!can(role, 'wages.read')) throw new MisForbiddenError('wages.read');

  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10);

  const [payroll, period, preflight] = await Promise.all([
    calculateMonthlyPayroll(year, month),
    getPayrollPeriod(year, month),
    getPayrollPreflight(year, month),
  ]);

  // W9: this screen carries counts, not money — "a leaked file reveals attendance, not
  // salaries." A hidden column the screen doesn't render is still a leak if it reaches the
  // browser at all (the same rule `withoutMoneyFields` enforces for material prices, D24), so
  // the money fields are stripped HERE, server-side, never merely left unrendered by the client
  // component. The payslip (`/mis/print/payslip/[id]`) is the Owner's money surface instead.
  const counts = payroll.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    employeeCode: r.employeeCode,
    payType: r.payType,
    workingDays: r.workingDays,
    present: r.present,
    absent: r.absent,
    leave: r.leave,
    halfDay: r.halfDay,
    totalLateMinutes: r.totalLateMinutes,
    totalOTMinutes: r.totalOTMinutes,
    allowanceDays: r.allowanceDays,
    needsPayCode: r.needsPayCode,
  }));

  return <PayrollScreen rows={counts} year={year} month={month} period={period} preflight={preflight} />;
}
