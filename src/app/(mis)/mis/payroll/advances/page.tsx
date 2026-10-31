import { can } from '@/lib/mis/permissions';
import { DEFAULT_FACTORY_TIMEZONE, zonedParts } from '@/lib/mis/factory-time';
import { SalaryAdvancesScreen } from '@/components/mis/payroll/salary-advances-screen';
import { MisForbiddenError } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { getPayrollPeriod } from '@/server/mis/payroll-period';
import { getMisRole } from '@/server/mis/roles';
import { listSalaryAdvances } from '@/server/mis/salary-advance';
import { listRosterEmployees } from '@/server/mis/shift-roster';

type Props = { searchParams: Promise<{ year?: string; month?: string }> };

/** R2-324: the Owner records salary advances to recover from a month's pay. Money, so Owner only (wages.read). */
export default async function SalaryAdvancesPage({ searchParams }: Props) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'wages.read')) throw new MisForbiddenError('wages.read');
  const sp = await searchParams;
  const today = zonedParts(new Date(), DEFAULT_FACTORY_TIMEZONE);
  const parsedYear = Number.parseInt(sp.year ?? '', 10);
  const parsedMonth = Number.parseInt(sp.month ?? '', 10);
  const year = Number.isFinite(parsedYear) ? Math.min(Math.max(parsedYear, 2000), 2100) : today.year;
  const month = Number.isFinite(parsedMonth) ? Math.min(Math.max(parsedMonth, 1), 12) : today.month;
  const [advances, employees, period] = await Promise.all([listSalaryAdvances(year, month), listRosterEmployees(), getPayrollPeriod(year, month)]);
  return (
    <SalaryAdvancesScreen
      year={year}
      month={month}
      closed={period.status === 'CLOSED'}
      advances={advances.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name, employeeCode: e.employeeCode }))}
    />
  );
}
