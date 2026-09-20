'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type PayrollRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  workingDays: number;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  totalLateMinutes: number;
  totalOTMinutes: number;
  basicWage: number;
  otPay: number;
  latePenalty: number;
  grossPay: number;
};

interface Props {
  payroll: PayrollRow[];
  year: number;
  month: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtMin(m: number) {
  if (m === 0) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

function fmtCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function downloadPayrollCsv(payroll: PayrollRow[], year: number, month: number, monthLabel: string) {
  const headers = ['Code', 'Employee', 'Present', 'Absent', 'Leave', 'Half-Day', 'Late (min)', 'OT (min)', 'Basic (₹)', 'OT Pay (₹)', 'Penalty (₹)', 'Gross (₹)'];
  const rows = payroll.map(r => [
    r.employeeCode, r.employeeName,
    String(r.present), String(r.absent), String(r.leave), String(r.halfDay),
    String(r.totalLateMinutes), String(r.totalOTMinutes),
    String(r.basicWage), String(r.otPay), String(r.latePenalty), String(r.grossPay),
  ]);
  const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-${monthLabel.replace(' ', '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}



export function PayrollScreen({ payroll, year, month }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return payroll;
    const q = search.toLowerCase();
    return payroll.filter(r => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q));
  }, [payroll, search]);

  const totals = useMemo(() => ({
    basic: filtered.reduce((s, r) => s + r.basicWage, 0),
    ot: filtered.reduce((s, r) => s + r.otPay, 0),
    penalty: filtered.reduce((s, r) => s + r.latePenalty, 0),
    gross: filtered.reduce((s, r) => s + r.grossPay, 0),
  }), [filtered]);

  const monthLabel = `${MONTHS[month - 1]} ${year}`;

  function nav(newYear: number, newMonth: number) {
    router.push(`/mis/payroll?year=${newYear}&month=${newMonth}`);
  }

  function prevMonth() {
    if (month === 1) nav(year - 1, 12);
    else nav(year, month - 1);
  }

  function nextMonth() {
    if (month === 12) nav(year + 1, 1);
    else nav(year, month + 1);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Payroll</h1>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">←</button>
          <span className="font-medium text-gray-800">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">→</button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: String(filtered.length), color: 'text-gray-900' },
          { label: 'Basic Wages', value: fmtCurrency(totals.basic), color: 'text-gray-900' },
          { label: 'OT Pay', value: fmtCurrency(totals.ot), color: 'text-blue-600' },
          { label: 'Gross Payroll', value: fmtCurrency(totals.gross), color: 'text-green-600' },
        ].map((tile) => (
          <div key={tile.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">{tile.label}</div>
            <div className={`text-xl font-bold mt-1 ${tile.color}`}>{tile.value}</div>
          </div>
        ))}
      </div>

      {/* Search + export */}
      <div className="flex items-center gap-3">
        <input
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => downloadPayrollCsv(filtered, year, month, monthLabel)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 whitespace-nowrap"
        >
          ↓ CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-3 text-left font-medium">Employee</th>
              <th className="px-4 py-3 text-center font-medium">Present</th>
              <th className="px-4 py-3 text-center font-medium">Absent</th>
              <th className="px-4 py-3 text-center font-medium">Leave</th>
              <th className="px-4 py-3 text-center font-medium">Late</th>
              <th className="px-4 py-3 text-center font-medium">OT</th>
              <th className="px-4 py-3 text-right font-medium">Basic</th>
              <th className="px-4 py-3 text-right font-medium">OT Pay</th>
              <th className="px-4 py-3 text-right font-medium">Penalty</th>
              <th className="px-4 py-3 text-right font-medium">Gross</th>
              <th className="px-4 py-3 text-center font-medium">Print</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-10 text-center text-gray-400">No payroll data.</td></tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.employeeId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{row.employeeName}</div>
                    <div className="text-xs text-gray-400 font-mono">{row.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-green-700 font-medium">{row.present}</td>
                  <td className="px-4 py-3 text-center text-red-600">{row.absent}</td>
                  <td className="px-4 py-3 text-center text-yellow-600">{row.leave}</td>
                  <td className="px-4 py-3 text-center text-orange-600 text-xs">{fmtMin(row.totalLateMinutes)}</td>
                  <td className="px-4 py-3 text-center text-blue-600 text-xs">{fmtMin(row.totalOTMinutes)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmtCurrency(row.basicWage)}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{row.otPay > 0 ? fmtCurrency(row.otPay) : '—'}</td>
                  <td className="px-4 py-3 text-right text-red-500">{row.latePenalty > 0 ? `−${fmtCurrency(row.latePenalty)}` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCurrency(row.grossPay)}</td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`/mis/print/payslip/${row.employeeId}?year=${year}&month=${month}`}
                      target="_blank"
                      className="text-xs text-blue-600 hover:underline"
                    >Payslip</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-gray-200">
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-700" colSpan={6}>Total ({filtered.length} employees)</td>
                <td className="px-4 py-3 text-right font-semibold">{fmtCurrency(totals.basic)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-600">{fmtCurrency(totals.ot)}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-500">−{fmtCurrency(totals.penalty)}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700">{fmtCurrency(totals.gross)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
