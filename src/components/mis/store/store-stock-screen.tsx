'use client';
import { useState } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';

type StockRow = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  stockBalance: number;
  reorderLevel: number | null;
  belowReorder: boolean;
  pricePerUnit?: number | null;
  stockValue?: number | null;
  isDemo: boolean;
};

type Props = {
  rows: StockRow[];
  isOwner: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  CONSUMABLE: 'Consumable',
  EQUIPMENT: 'Equipment Spare',
  OTHER: 'Other',
};

function downloadCsv(rows: StockRow[], isOwner: boolean) {
  const headers = [
    'Code', 'SKU', 'Name', 'Category', 'Unit', 'Balance', 'Reorder Level', 'Status',
    ...(isOwner ? ['Price/Unit (₹)', 'Stock Value (₹)'] : []),
  ];
  const data = rows.map((r) => [
    r.code, r.sku ?? '', r.name,
    CATEGORY_LABEL[r.category] ?? r.category,
    r.unit, r.stockBalance.toFixed(2),
    r.reorderLevel != null ? String(r.reorderLevel) : '',
    r.stockBalance <= 0 ? 'Out of Stock' : r.belowReorder ? 'Low Stock' : 'OK',
    ...(isOwner ? [
      r.pricePerUnit != null ? r.pricePerUnit.toFixed(2) : '',
      r.stockValue != null ? r.stockValue.toFixed(2) : '',
    ] : []),
  ]);
  const lines = [headers, ...data].map((row) =>
    row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StoreStockScreen({ rows, isOwner }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.sku ?? '').toLowerCase().includes(q);
    const matchCat = !categoryFilter || r.category === categoryFilter;
    const matchStatus =
      !statusFilter ||
      (statusFilter === 'critical' && r.stockBalance <= 0) ||
      (statusFilter === 'warning' && r.belowReorder && r.stockBalance > 0) ||
      (statusFilter === 'ok' && !r.belowReorder && r.stockBalance > 0);
    return matchSearch && matchCat && matchStatus;
  });

  const totalValue = isOwner
    ? rows.reduce((sum, r) => sum + (r.stockValue ?? 0), 0)
    : null;
  const criticalCount = rows.filter((r) => r.stockBalance <= 0).length;
  const warnCount = rows.filter((r) => r.belowReorder && r.stockBalance > 0).length;

  const columns: Column<StockRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (r) => <span className="font-mono text-xs text-slate-500">{r.sku ?? '—'}</span>,
    },
    {
      key: 'name',
      header: 'Item',
      render: (r) => (
        <div>
          <Link
            href={`/mis/store/ledger/${r.id}`}
            className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
          >
            {r.name}
          </Link>
          <div className="text-xs text-slate-400">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => <span className="text-sm text-slate-600">{CATEGORY_LABEL[r.category] ?? r.category}</span>,
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (r) => {
        const tone = r.stockBalance <= 0 ? 'critical' : r.belowReorder ? 'warning' : 'good';
        return (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge tone={tone}>
              {r.stockBalance.toFixed(2)} {r.unit}
            </StatusBadge>
            {r.reorderLevel != null && r.belowReorder && (
              <span className="text-[10px] text-amber-600">Reorder ≥ {r.reorderLevel}</span>
            )}
          </div>
        );
      },
    },
    ...(isOwner
      ? [
          {
            key: 'value',
            header: 'Value (₹)',
            render: (r: StockRow) => (
              <div className="text-right">
                {r.stockValue != null ? (
                  <span className="font-mono text-sm">₹{r.stockValue.toFixed(2)}</span>
                ) : (
                  '—'
                )}
                {r.isDemo && (
                  <span className="ml-1 text-[9px] text-amber-500 font-medium">DEMO</span>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'ledger',
      header: '',
      render: (r) => (
        <Link
          href={`/mis/store/ledger/${r.id}`}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap"
        >
          Ledger →
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Stock Summary</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} items
            {criticalCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {criticalCount} out of stock</span>
            )}
            {warnCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">· {warnCount} below reorder</span>
            )}
          </p>
        </div>
        <button
          onClick={() => downloadCsv(filtered, isOwner)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
        >
          ↓ CSV
        </button>
      </div>

      {/* Owner total value card */}
      {isOwner && totalValue != null && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-center gap-3">
          <div>
            <div className="text-xs text-blue-500 font-medium">Total Stock Value</div>
            <div className="text-2xl font-bold text-blue-900 font-mono">
              ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <span className="ml-2 text-xs text-amber-500 font-medium">DEMO PRICES</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search by name, code or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Categories</option>
          <option value="RAW_MATERIAL">Raw Material</option>
          <option value="CONSUMABLE">Consumable</option>
          <option value="EQUIPMENT">Equipment Spare</option>
          <option value="OTHER">Other</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <option value="">All Status</option>
          <option value="critical">Out of Stock</option>
          <option value="warning">Low Stock</option>
          <option value="ok">OK</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No items"
        emptyBody={search || categoryFilter || statusFilter ? 'Try clearing filters.' : 'No items configured.'}
      />
    </div>
  );
}
