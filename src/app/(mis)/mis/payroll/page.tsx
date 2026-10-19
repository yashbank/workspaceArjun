import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { calculateMonthlyPayroll } from '@/server/mis/payroll';
import { getPayrollPeriod, getPayrollPreflight } from '@/server/mis/payroll-period';
import { listBankDetailGaps } from '@/server/mis/payroll-ledger';
import { listPayslipReleases } from '@/server/mis/payslips';
import { PayrollScreen } from '@/components/mis/payroll/payroll-screen';
import { DEFAULT_FACTORY_TIMEZONE, zonedParts } from '@/lib/mis/factory-time';

type Props = { searchParams: Promise<{ year?: string; month?: string }> };

export default async function PayrollPage({ searchParams }: Props) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  // Pay figures are wages: Owner only (S9 / D24). The server function refuses too; this is the page's own line.
  if (!can(role, 'wages.read')) throw new MisForbiddenError('wages.read');

  const sp = await searchParams;
  // R3 B46: today is the factory's; a hand-typed ?year / ?month is clamped, never trusted.
  const today = zonedParts(new Date(), DEFAULT_FACTORY_TIMEZONE);
  const parsedYear = Number.parseInt(sp.year ?? '', 10);
  const parsedMonth = Number.parseInt(sp.month ?? '', 10);
  const year = Number.isFinite(parsedYear) ? Math.min(Math.max(parsedYear, 2000), 2100) : today.year;
  const month = Number.isFinite(parsedMonth) ? Math.min(Math.max(parsedMonth, 1), 12) : today.month;

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

  // R2-111: who has been sent this month's payslip (only a CLOSED month can be sent).
  // R2-110: who the bank transfer file will leave out — names and a reason, no account number.
  const [releases, bankGaps] = await Promise.all([
    period.status === 'CLOSED' ? listPayslipReleases(year, month) : Promise.resolve([]),
    listBankDetailGaps(payroll.map((r) => ({ employeeId: r.employeeId, employeeCode: r.employeeCode, employeeName: r.employeeName }))),
  ]);

  return (
    <PayrollScreen
      rows={counts}
      year={year}
      month={month}
      period={period}
      preflight={preflight}
      releasedIds={releases.map((r) => r.employeeId)}
      bankGaps={bankGaps}
    />
  );
}
