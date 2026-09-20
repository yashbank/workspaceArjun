import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { getProductionReport, getAttendanceReport, getQcReport, getOrdersReport, getStoreReport } from '@/server/mis/reports';
import { ReportsScreen } from '@/components/mis/reports/reports-screen';

function monthRange(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0, 23, 59, 59);
  return { from, to };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { year?: string; month?: string };
}) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'reports.read')) {
    return <div className="p-8 text-slate-500">You don&apos;t have access to reports.</div>;
  }

  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const month = parseInt(sp.month ?? String(now.getMonth() + 1), 10);

  const range = monthRange(year, month);
  const [production, attendance, qc, orders, store] = await Promise.all([
    getProductionReport(range),
    getAttendanceReport(range),
    getQcReport(range),
    getOrdersReport(range),
    getStoreReport(range),
  ]);

  const canSeeWages = can(role, 'wages.read');
  const isOwner = role === 'OWNER';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <ReportsScreen
      production={production}
      attendance={attendance}
      qc={qc}
      orders={orders as any[]}
      store={store}
      canSeeWages={canSeeWages}
      isOwner={isOwner}
      rangeLabel={`${MONTHS[month - 1]} ${year}`}
      year={year}
      month={month}
    />
  );
}
