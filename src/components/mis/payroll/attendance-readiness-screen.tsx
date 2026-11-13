import Link from 'next/link';

import type { AttendanceReadinessRow, PayrollPreflightItem } from '@/server/mis/payroll-period';

/**
 * R2-180: the Admin's view of month-end — the attendance checks and the register, nothing else.
 * No pay figures, no pay-code line, no export: those exist only on the Owner's payroll screen
 * (absent, not greyed out). Counts only.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type Props = { year: number; month: number; checks: PayrollPreflightItem[]; rows: AttendanceReadinessRow[] };

export function AttendanceReadinessScreen({ year, month, checks, rows }: Props) {
  const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/mis/payroll?year=${prev.y}&month=${prev.m}`} aria-label="Previous month" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">←</Link>
        <h1 className="text-xl font-bold text-slate-900">{MONTHS[month - 1]} {year}</h1>
        <Link href={`/mis/payroll?year=${next.y}&month=${next.m}`} aria-label="Next month" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">→</Link>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Before export</h2>
        <ul className="space-y-2 text-sm">
          {checks.map((item) => (
            <li key={item.id} className="flex min-h-11 items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{item.ok ? '✓' : '!'}</span>
              <span className="text-slate-800">{item.label}</span>
              {item.detail && !item.ok ? <span className="ml-auto text-xs text-amber-700">{item.detail}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">The Owner runs the export. Fix what is flagged here on the <Link href="/mis/attendance" className="font-medium text-indigo-600 underline">Attendance</Link> screen.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-3 text-left font-medium">Employee</th>
              <th className="px-4 py-3 text-center font-medium">Present</th>
              <th className="px-4 py-3 text-center font-medium">Half-day</th>
              <th className="px-4 py-3 text-center font-medium">Absent</th>
              <th className="px-4 py-3 text-center font-medium">Leave</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No attendance recorded for this month.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{r.employeeName}</div><div className="font-mono text-xs text-slate-400">{r.employeeCode}</div></td>
                <td className="px-4 py-3 text-center font-medium text-green-700">{r.present}</td>
                <td className="px-4 py-3 text-center text-amber-700">{r.halfDay}</td>
                <td className="px-4 py-3 text-center text-red-600">{r.absent}</td>
                <td className="px-4 py-3 text-center text-amber-600">{r.leave}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
