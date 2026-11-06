import Link from 'next/link';
import { toPlain } from '@/lib/mis/plain';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { factoryDateKey } from '@/lib/mis/factory-time';
import {
  clampReportMonth,
  getProductionReport,
  getAttendanceReport,
  getQcReport,
  getOrdersReport,
  getStoreReport,
  getMachineUtilisationReport,
} from '@/server/mis/reports';
import { addDaysToDateKey } from '@/lib/mis/factory-time';
import { factoryRangeFromKeys, resolveRange } from '@/lib/mis/report-range';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { ReportsScreen, type ReportSection } from '@/components/mis/reports/reports-screen';
import { WastageDesktop, type WastageView } from '@/components/mis/desktop/wastage-desktop';
import { getWastageReport } from '@/server/mis/reports';
import { WEEK_CHOICES } from '@/lib/mis/wastage';

/** The wastage report is a trailing-weeks window, so the shared range picks the nearest offered span that covers it (4, 10, 13 or 26 weeks). */
const weeksFor = (days: number) => WEEK_CHOICES.find((w) => w * 7 >= days) ?? WEEK_CHOICES[WEEK_CHOICES.length - 1];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; freq?: string; at?: string; view?: string; weeks?: string; machine?: string; unit?: string }>;
}) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'reports.read')) {
    return <div className="p-8 text-slate-500">You don&apos;t have access to reports.</div>;
  }

  const sp = await searchParams;
  // B77/B78: the month is the FACTORY's, clamped; the range is half-open (gte from, lt to).
  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(new Date(), timeZone);
  const { year, month } = clampReportMonth(sp, todayKey);
  // R8 T4: the same ?freq=&at= the dashboard uses. An old ?year=&month= link still lands on that month.
  const legacy = !sp.freq && !sp.at && (sp.year || sp.month);
  const keyRange = resolveRange(legacy ? { freq: 'month', at: `${year}-${String(month).padStart(2, '0')}-01` } : sp, todayKey);
  const range = factoryRangeFromKeys(keyRange.fromKey, keyRange.toKey, timeZone);

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
      rangeLabel={keyRange.label}
      range={keyRange}
      rangeParams={{ view: sp.view }}
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
  // The window ends on the range's last day (a past `at` shows that past), never later than today.
  const lastKey = addDaysToDateKey(keyRange.toKey, -1);
  let wastage: WastageView | null = null;
  try {
    const report = await getWastageReport({ weeks: sp.weeks ?? weeksFor(keyRange.days), machineId: sp.machine, unit: sp.unit, lastKey });
    wastage = { ...report, keyRange, exportLastKey: lastKey < todayKey ? lastKey : undefined };
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
