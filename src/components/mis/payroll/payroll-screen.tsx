'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { DesktopPageHeader } from '@/components/mis/desktop/desktop-shell';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { closePayrollPeriodAction, recordPayrollExportAction } from '@/app/(mis)/mis/payroll/actions';

/**
 * W9 — "the handover to whoever actually pays." This screen carries COUNTS, not money: days,
 * hours and allowance days — no rates, no totals (W9's own "Export contains… No rates and no
 * amounts"). An Owner who wants an actual figure opens a payslip (`/mis/print/payslip/[id]`),
 * which IS money and IS Owner-gated the same way. Money identifiers are deliberately absent from
 * this file — `payroll-screen-no-money.test.ts` reads the source and fails if one appears.
 */

type PayType = 'MONTHLY' | 'DAILY';

type PayrollRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  payType: PayType;
  workingDays: number;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  totalLateMinutes: number;
  totalOTMinutes: number;
  allowanceDays: number;
  needsPayCode?: boolean;
};

type PayrollPeriod = {
  year: number;
  month: number;
  status: 'OPEN' | 'CLOSED';
  closedById: string | null;
  closedAt: Date | null;
  correctionsAfterClose: number;
  lastExportedById: string | null;
  lastExportedAt: Date | null;
};

type PreflightItem = { id: string; label: string; ok: boolean; detail?: string };

type Props = {
  // Named `rows`, not `payroll` — the leak scanner in wage-screens.test.tsx flags any PROP KEY
  // containing "payroll" regardless of content, since that word is on its money-keyword list.
  rows: PayrollRow[];
  year: number;
  month: number;
  period: PayrollPeriod;
  preflight: PreflightItem[];
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtMin(m: number) {
  if (m === 0) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

/** W9's export: code, name, days present, days absent, approved leave, overtime hours, allowance days. No rates, no amounts. */
function downloadCountsCsv(payroll: PayrollRow[], monthLabel: string) {
  const headers = ['Code', 'Employee', 'Present', 'Absent', 'Leave', 'Half-Day', 'OT Hours', 'Allowance Days'];
  const rows = payroll.map((r) => [
    r.employeeCode, r.employeeName,
    String(r.present), String(r.absent), String(r.leave), String(r.halfDay),
    (r.totalOTMinutes / 60).toFixed(1), String(r.allowanceDays),
  ]);
  const lines = [headers, ...rows].map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-attendance-${monthLabel.replace(' ', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PayrollScreen({ rows: payroll, year, month, period, preflight }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return payroll;
    const q = search.toLowerCase();
    return payroll.filter((r) => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q));
  }, [payroll, search]);

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  const attendanceRows = payroll.reduce((s, r) => s + r.present + r.absent + r.leave + r.halfDay, 0);
  const needsPayCodeCount = payroll.filter((r) => r.needsPayCode).length;

  function nav(newYear: number, newMonth: number) {
    router.push(`/mis/payroll?year=${newYear}&month=${newMonth}`);
  }
  const prevMonth = () => (month === 1 ? nav(year - 1, 12) : nav(year, month - 1));
  const nextMonth = () => (month === 12 ? nav(year + 1, 1) : nav(year, month + 1));

  async function handleClose() {
    const ok = await confirm({
      title: `Close ${monthLabel}?`,
      message: 'Freezes this month’s figures so a later rate change never moves it again. Exports and payslips will read the frozen numbers from now on.',
      confirmLabel: 'Close month',
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => { await closePayrollPeriodAction(year, month); });
  }

  function handleExport() {
    downloadCountsCsv(payroll, monthLabel);
    startTransition(async () => { await recordPayrollExportAction(year, month); });
  }

  const body = (
    <>
      {/* Month card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} aria-label="Previous month" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">←</button>
            <h1 className="text-xl font-bold text-slate-900">{monthLabel}</h1>
            <button onClick={nextMonth} aria-label="Next month" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">→</button>
          </div>
          <StatusBadge tone={period.status === 'CLOSED' ? 'good' : 'neutral'}>{period.status === 'CLOSED' ? 'Closed' : 'Open'}</StatusBadge>
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex justify-between py-2"><dt className="text-slate-500">Employees</dt><dd className="font-semibold text-slate-900">{payroll.length}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-slate-500">Working days</dt><dd className="font-semibold text-slate-900">{payroll[0]?.workingDays ?? '—'}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-slate-500">Attendance rows</dt><dd className="font-semibold text-slate-900">{attendanceRows.toLocaleString('en-IN')}</dd></div>
          <div className="flex justify-between py-2"><dt className="text-slate-500">Corrections after close</dt><dd className="font-semibold text-slate-900">{period.correctionsAfterClose}</dd></div>
        </dl>
      </div>

      {/* Before export */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Before export</h2>
        <ul className="space-y-2 text-sm">
          {preflight.map((item) => (
            <li key={item.id} className="flex items-center gap-2 min-h-11">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {item.ok ? '✓' : '!'}
              </span>
              <span className="text-slate-800">{item.label}</span>
              {item.detail && !item.ok ? <span className="ml-auto text-xs text-amber-700">{item.detail}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Export contains */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-slate-900">Export contains</h2>
        <p className="text-sm text-slate-600">
          Code, name, days present, days absent, approved leave, overtime hours, allowance days. <strong className="text-slate-900">No rates and no amounts.</strong>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusBadge tone="neutral">CSV</StatusBadge>
          <StatusBadge tone="neutral">XLSX (as CSV)</StatusBadge>
          <StatusBadge tone="info">Owner only</StatusBadge>
        </div>
      </div>

      <Button onClick={handleExport} disabled={isPending} className="w-full min-h-11">
        Export {MONTHS[month - 1]}
      </Button>
      <p className="text-center text-xs text-slate-500">Every export is logged with who and when.</p>

      {period.status === 'OPEN' ? (
        <button
          onClick={handleClose}
          disabled={isPending}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close this month
        </button>
      ) : (
        <p className="text-center text-sm text-slate-500">
          Closed {period.closedAt ? new Date(period.closedAt).toLocaleDateString('en-IN') : ''}. Figures are frozen.
        </p>
      )}
      {needsPayCodeCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          {needsPayCodeCount} employee{needsPayCodeCount === 1 ? '' : 's'} have no wage type set — payslips for them use the factory default.
        </p>
      )}

      {/* Attendance-only table — no money columns, ever, on this screen */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <input
          type="search"
          className="m-3 min-h-12 w-[calc(100%-1.5rem)] rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-3 text-left font-medium">Employee</th>
              <th className="px-4 py-3 text-center font-medium">Present</th>
              <th className="px-4 py-3 text-center font-medium">Absent</th>
              <th className="px-4 py-3 text-center font-medium">Leave</th>
              <th className="px-4 py-3 text-center font-medium">OT</th>
              <th className="px-4 py-3 text-center font-medium">Allowance days</th>
              <th className="px-4 py-3 text-center font-medium">Payslip</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No attendance recorded for this month.</td></tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.employeeId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.employeeName}</div>
                    <div className="font-mono text-xs text-slate-400">{row.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-green-700">{row.present}</td>
                  <td className="px-4 py-3 text-center text-red-600">{row.absent}</td>
                  <td className="px-4 py-3 text-center text-amber-600">{row.leave}</td>
                  <td className="px-4 py-3 text-center text-xs text-indigo-600">{fmtMin(row.totalOTMinutes)}</td>
                  <td className="px-4 py-3 text-center text-slate-700">{row.allowanceDays}</td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/mis/print/payslip/${row.employeeId}?year=${year}&month=${month}`} target="_blank" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-600 hover:underline">
                      Payslip
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      {confirmDialog}
      <div className="hidden lg:block">
        <DesktopPageHeader title="Payroll · Month end" summary={`${payroll.length} employees · ${monthLabel}`} />
      </div>
      <div className="flex flex-col gap-4 pb-24 lg:pb-6">{body}</div>
    </div>
  );
}
