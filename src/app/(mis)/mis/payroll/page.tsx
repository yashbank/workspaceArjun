import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { MisForbiddenError } from '@/server/mis/auth';
import { calculateMonthlyPayroll } from '@/server/mis/payroll';
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

  const payroll = await calculateMonthlyPayroll(year, month);

  return <PayrollScreen payroll={payroll} year={year} month={month} />;
}
