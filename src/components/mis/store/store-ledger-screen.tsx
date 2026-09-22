'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';

type TxnRow = {
  id: string;
  txnNumber: string;
  type: 'IN' | 'OUT';
  quantity: number;
  balanceQty: number;
  referenceNo: string | null;
  reason: string | null;
  isOverIssue: boolean;
  createdAt: Date;
};

type ItemInfo = {
  id: string;
  name: string;
  code: string;
  sku: string | null;
  unit: string;
  stockBalance: number;
};

type Props = {
  item: ItemInfo;
  txns: TxnRow[];
};

function downloadCsv(item: ItemInfo, txns: TxnRow[]) {
  const headers = ['Txn #', 'Type', 'Qty', 'Balance After', 'Ref No', 'Notes', 'Over-issue', 'Date'];
  const data = txns.map((t) => [
    t.txnNumber, t.type === 'IN' ? 'IN' : 'OUT',
    t.quantity.toFixed(2), t.balanceQty.toFixed(2),
    t.referenceNo ?? '', t.reason ?? '',
    t.isOverIssue ? 'Yes' : '',
    new Date(t.createdAt).toLocaleDateString('en-IN'),
  ]);
  const lines = [headers, ...data].map((row) =>
    row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledger-${item.code}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StoreLedgerScreen({ item, txns }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const filtered = txns.filter((t) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      t.txnNumber.toLowerCase().includes(q) ||
      (t.referenceNo ?? '').toLowerCase().includes(q) ||
      (t.reason ?? '').toLowerCase().includes(q);
    const matchType = !typeFilter || t.type === typeFilter;
    return matchSearch && matchType;
  });

  const totalIn = txns.filter((t) => t.type === 'IN').reduce((s, t) => s + t.quantity, 0);
  const totalOut = txns.filter((t) => t.type === 'OUT').reduce((s, t) => s + t.quantity, 0);

  const columns: Column<TxnRow>[] = [
    {
      key: 'txnNumber',
      header: 'Txn #',
      render: (r) => <span className="font-mono text-xs">{r.txnNumber}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={r.type === 'IN' ? 'good' : r.isOverIssue ? 'critical' : 'warning'}>
            {r.type}
          </StatusBadge>
          {r.isOverIssue && <span className="text-[10px] text-red-500 font-medium">over-issue</span>}
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (r) => (
        <span className={`font-mono font-semibold ${r.type === 'IN' ? 'text-green-700' : 'text-red-700'}`}>
          {r.type === 'IN' ? '+' : '−'}{r.quantity.toFixed(2)} {item.unit}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance After',
      render: (r) => (
        <span className="font-mono text-slate-600">{r.balanceQty.toFixed(2)} {item.unit}</span>
      ),
    },
    {
      key: 'ref',
      header: 'Ref / Notes',
      render: (r) => (
        <div className="text-sm text-slate-600">
          {r.referenceNo && <div>{r.referenceNo}</div>}
          {r.reason && <div className="text-slate-400 text-xs">{r.reason}</div>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        <span className="text-sm text-slate-500 whitespace-nowrap">
          {new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-slate-500">
        <Link href="/mis/store" className="inline-flex min-h-11 items-center hover:underline">Store</Link>
        <span aria-hidden="true">/</span>
        <Link href="/mis/store/stock" className="inline-flex min-h-11 items-center hover:underline">Stock</Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-700 font-medium">{item.name}</span>
      </nav>

      {/* Item header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{item.name}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {item.code} {item.sku ? `· ${item.sku}` : ''}
          </p>
        </div>
        <button
          onClick={() => downloadCsv(item, filtered)}
          className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
        >
          ↓ CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-xl px-4 py-3">
          <div className="text-xs text-slate-500">Current Balance</div>
          <div className="text-xl font-bold text-slate-900 font-mono mt-0.5">
            {item.stockBalance.toFixed(2)} <span className="text-sm font-normal">{item.unit}</span>
          </div>
        </div>
        <div className="bg-green-50 rounded-xl px-4 py-3">
          <div className="text-xs text-green-600">Total IN</div>
          <div className="text-xl font-bold text-green-800 font-mono mt-0.5">
            +{totalIn.toFixed(2)} <span className="text-sm font-normal">{item.unit}</span>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl px-4 py-3">
          <div className="text-xs text-red-500">Total OUT</div>
          <div className="text-xl font-bold text-red-700 font-mono mt-0.5">
            −{totalOut.toFixed(2)} <span className="text-sm font-normal">{item.unit}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search txn #, ref, notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Types</option>
          <option value="IN">IN only</option>
          <option value="OUT">OUT only</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No transactions"
        emptyBody="No store transactions for this item yet."
      />
    </div>
  );
}
