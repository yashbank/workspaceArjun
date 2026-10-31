import Link from 'next/link';

import { PageBack } from '@/components/mis/common/page-back';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { shiftMonth } from '@/lib/mis/attendance-month';
import { formatFactoryTime } from '@/lib/mis/factory-time';
import { requireMisAccess } from '@/server/mis/guard';
import { getMyAttendanceMonth } from '@/server/mis/my-attendance';

const TONE: Record<string, 'good' | 'warning' | 'critical' | 'neutral'> = { PRESENT: 'good', HALF_DAY: 'warning', ABSENT: 'critical', LEAVE: 'neutral', HOLIDAY: 'neutral' };
const hm = (min: number) => (min > 0 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : '—');

/** R2-172 — my attendance: the days I worked, my punches, late and overtime, for one month. My own record only. */
export default async function MyAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireMisAccess();
  const { month } = await searchParams;
  const data = await getMyAttendanceMonth(month);
  const nextKey = shiftMonth(data.monthKey, 1);
  const stat = (label: string, value: string) => (
    <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-semibold text-slate-900">{value}</div></div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <PageBack href="/mis/me" label="Me" />
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-2xl font-bold text-slate-900">My attendance</h1>
        <div className="mt-2 flex items-center justify-between text-sm">
          <Link href={`/mis/me/attendance?month=${shiftMonth(data.monthKey, -1)}`} className="inline-flex min-h-11 items-center px-2 font-medium text-slate-700">← Previous</Link>
          <span className="font-medium text-slate-900">{data.monthKey}</span>
          <Link href={`/mis/me/attendance?month=${nextKey}`} className="inline-flex min-h-11 items-center px-2 font-medium text-slate-700">Next →</Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {stat('Days worked', String(data.summary.daysWorked))}
          {stat('Absent / Leave', `${data.summary.absent} / ${data.summary.leave}`)}
          {stat('Late', hm(data.summary.lateMinutes))}
          {stat('Overtime', hm(data.summary.otMinutes))}
        </div>
      </section>
      {data.days.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No attendance recorded for this month.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {data.days.map((d) => (
            <li key={d.dateKey} className="flex items-center justify-between gap-2 px-4 py-3">
              <div>
                <div className="font-medium text-slate-900">{d.dateKey.slice(8)}/{d.dateKey.slice(5, 7)}</div>
                <div className="text-xs text-slate-500">
                  {d.clockIn ? formatFactoryTime(d.clockIn, data.timeZone) : '—'} – {d.clockOut ? formatFactoryTime(d.clockOut, data.timeZone) : '—'}
                  {d.otMinutes > 0 ? ` · OT ${hm(d.otMinutes)}` : ''}{d.lateMinutes > 0 ? ` · late ${hm(d.lateMinutes)}` : ''}
                </div>
              </div>
              <StatusBadge tone={TONE[d.status] ?? 'neutral'}>{d.status.replace(/_/g, ' ')}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
