'use client';
import Link from 'next/link';

import { formatQty } from '@/lib/mis/qty-by-unit';

export type LegacyIssueView = {
  id: string;
  when: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  balanceAfter: number;
  createdBy: string | null;
  notes: string | null;
  referenceNo: string | null;
};

const HEADERS = ['Date', 'Item code', 'Item', 'Quantity', 'Balance after', 'Created by', 'Notes', 'Reference'];

function toCsv(rows: LegacyIssueView[]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [HEADERS, ...rows.map((r) => [r.when, r.itemCode, r.itemName, r.quantity, r.balanceAfter, r.createdBy ?? '', r.notes ?? '', r.referenceNo ?? ''])];
  return lines.map((l) => l.map(cell).join(',')).join('\r\n');
}

/** Read-only (R3-QCR B83). No price, rate or value anywhere on this screen. */
export function LegacyIssuesScreen({ rows }: { rows: LegacyIssueView[] }) {
  function download() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'legacy-store-issues.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link href="/mis/reports" className="inline-flex min-h-11 items-center text-sm text-slate-600 hover:underline">← Reports</Link>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">{rows.length} legacy issues not linked to an order</h1>
        <button
          type="button"
          onClick={download}
          disabled={rows.length === 0}
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          ↓ CSV
        </button>
      </div>
      <p className="mb-4 text-sm text-slate-500">Read-only: these rows predate order-linked issuing and are not counted in traceability.</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">No legacy issues.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                {HEADERS.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{r.when}</td>
                  <td className="px-4 py-3 font-mono">{r.itemCode}</td>
                  <td className="px-4 py-3">{r.itemName}</td>
                  <td className="px-4 py-3">{formatQty(r.quantity)}</td>
                  <td className="px-4 py-3">{formatQty(r.balanceAfter)}</td>
                  <td className="px-4 py-3">{r.createdBy ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{r.notes ?? '—'}</td>
                  <td className="px-4 py-3 font-mono">{r.referenceNo ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
