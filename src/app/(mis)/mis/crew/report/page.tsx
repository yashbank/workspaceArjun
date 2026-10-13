import Link from 'next/link';

import { Forbidden } from '@/components/mis/forbidden';
import { isDateKey } from '@/lib/mis/crew-hours';
import { addDaysToDateKey, factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { getManpowerReport } from '@/server/mis/worker-allocation';

/**
 * The day's manpower report (R3 B102): per shift who is allocated, clocked in and idle, and the
 * person-hours each order and phase took. Names and hours only: there is no money on this page.
 */
export default async function ManpowerReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'production.read')) return <Forbidden />;

  const today = factoryDateKey(new Date(), await getFactoryTimezone());
  const dateKey = params.date && isDateKey(params.date) ? params.date : today;
  const report = await getManpowerReport(dateKey);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Manpower · {dateKey}</h1>
        <div className="flex gap-2 text-sm font-medium text-indigo-700">
          <Link href={`/mis/crew/report?date=${addDaysToDateKey(dateKey, -1)}`} className="inline-flex min-h-11 items-center">
            ← Previous day
          </Link>
          <Link href={`/mis/crew/report?date=${addDaysToDateKey(dateKey, 1)}`} className="inline-flex min-h-11 items-center">
            Next day →
          </Link>
          <Link href="/mis/crew" className="inline-flex min-h-11 items-center">
            Crew board
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">By shift</h2>
        {report.shifts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No shifts are set up.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {report.shifts.map((s) => (
              <div key={s.shiftId} className="grid grid-cols-2 gap-2 px-5 py-3 text-sm sm:grid-cols-5">
                <div className="font-medium text-slate-900">{s.name}</div>
                <div>Allocated <span className="font-mono">{s.allocated}</span></div>
                <div>Clocked in <span className="font-mono">{s.clockedIn}</span></div>
                <div>Idle <span className="font-mono">{s.idle}</span></div>
                <div>Unstaffed bookings <span className="font-mono">{s.unstaffedBookings}</span></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Person-hours by order and phase</h2>
        {report.phases.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">No crew was allocated on this day.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {report.phases.map((p) => (
              <div key={`${p.orderNumber}-${p.phaseName}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-slate-900">
                  <span className="font-mono">{p.orderNumber ?? 'No order'}</span> · {p.phaseName ?? 'No phase'}
                </span>
                <span className="font-mono text-slate-700">{p.personHours.toFixed(1)} h</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
