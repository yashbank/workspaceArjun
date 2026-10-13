import Link from 'next/link';
import { toPlain } from '@/lib/mis/plain';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { factoryDateKey } from '@/lib/mis/factory-time';
import {
  clampReportMonth,
  factoryMonthRange,
  getProductionReport,
  getAttendanceReport,
  getQcReport,
  getOrdersReport,
  getStoreReport,
  getMachineUtilisationReport,
} from '@/server/mis/reports';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { ReportsScreen, type ReportSection } from '@/components/mis/reports/reports-screen';
import { WastageDesktop } from '@/components/mis/desktop/wastage-desktop';
import { getWastageReport } from '@/server/mis/reports';
import { clampWeeks, type WastageReport } from '@/lib/mis/wastage';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string; weeks?: string; machine?: string; unit?: string }>;
}) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'reports.read')) {
    return <div className="p-8 text-slate-500">You don&apos;t have access to reports.</div>;
  }

  const sp = await searchParams;
  // B77/B78: the month is the FACTORY's, clamped; the range is half-open (gte from, lt to).
  const timeZone = await getFactoryTimezone();
  const { year, month } = clampReportMonth(sp, factoryDateKey(new Date(), timeZone));
  const range = factoryMonthRange(year, month, timeZone);

  // B78: each section loads on its own; one failing never blanks the others.
  const failed: Partial<Record<ReportSection, string>> = {};
  async function section<T>(key: ReportSection, load: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await load();
    } catch (error) {
      console.error(`[mis-reports] the ${key} report failed to load`, error);
      failed[key] = `Could not load ${key}`;
      return fallback;
    }
  }
  const [production, attendance, qc, orders, store, machines] = await Promise.all([
    section('production', () => getProductionReport(range), { rows: [], totals: [], raw: [] }),
    section('attendance', () => getAttendanceReport(range), { rows: [], raw: [] }),
    section('qc', () => getQcReport(range), { rows: [], raw: [] }),
    section('orders', () => getOrdersReport(range), []),
    section('store', () => getStoreReport(range), { rows: [], raw: [] }),
    section('machines', () => getMachineUtilisationReport(range), { rows: [], availableMinutes: 0, fromIso: range.from.toISOString(), toIso: range.to.toISOString(), totals: { bookedMinutes: 0, allocationCount: 0, machineCount: 0 } }),
  ]);

  const canSeeWages = can(role, 'wages.read');
  const isOwner = role === 'OWNER';
  // B83: the legacy-issues report needs both permissions.
  const canSeeLegacyIssues = can(role, 'reports.read') && can(role, 'inventory.read');

  const phone = (
    <ReportsScreen
      production={toPlain(production)}
      attendance={toPlain(attendance)}
      qc={toPlain(qc)}
      orders={toPlain(orders)}
      store={toPlain(store)}
      machines={toPlain(machines)}
      failed={failed}
      canSeeWages={canSeeWages}
      isOwner={isOwner}
      rangeLabel={`${MONTHS[month - 1]} ${year}`}
      year={year}
      month={month}
      legacyIssuesHref={canSeeLegacyIssues ? '/mis/reports/legacy-issues' : undefined}
    />
  );

  // D7 from 1024px up; the existing tabbed reports below it. `?view=classic` keeps that screen
  // (production, attendance, QC, orders, store) reachable on a desktop, because D7 is the wastage report.
  if (sp.view === 'classic') return phone;
  // The desktop report is a second query on a page the phone also serves. If it fails the phone screen must
  // still render, so a failure here is LOGGED (never swallowed) and the desktop half says it could not load.
  let wastage: WastageReport | null = null;
  try {
    wastage = await getWastageReport({ weeks: clampWeeks(sp.weeks), machineId: sp.machine, unit: sp.unit });
  } catch (error) {
    console.error('[mis-reports] the wastage report failed to load', error);
  }

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        {canSeeLegacyIssues && (
          <div className="px-6 pt-4 text-sm">
            <Link href="/mis/reports/legacy-issues" className="inline-flex min-h-11 items-center text-indigo-700 hover:underline">Legacy store issues not linked to an order →</Link>
          </div>
        )}
        <WastageDesktop report={wastage} />
      </div>
    </>
  );
}
