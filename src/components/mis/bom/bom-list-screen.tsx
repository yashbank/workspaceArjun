'use client';

import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import type { BomOverviewRow } from '@/server/mis/bom';

const BOM_STATUS_LABEL: Record<BomOverviewRow['bomStatus'], string> = {
  NO_BOM: 'No BOM',
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
};

const BOM_STATUS_TONE: Record<BomOverviewRow['bomStatus'], BadgeTone> = {
  NO_BOM: 'neutral',
  DRAFT: 'warning',
  PENDING_APPROVAL: 'info',
  APPROVED: 'good',
};

type Paging = { total: number; page: number; params: Record<string, string | undefined> };

/** R2-122/123/137/143: a paged (10/page) BOM list with header-level order + BOM lifecycle data, so a role can tell draft from approved without opening each order. */
export function BomListScreen({ rows, paging }: { rows: BomOverviewRow[]; paging?: Paging }) {
  const search = paging?.params.q ?? '';

  const columns: Column<BomOverviewRow>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (r) => (
        <div>
          <span className="font-medium text-slate-900">{r.orderNumber}</span>
          <div className="text-xs text-slate-500">{r.customerName ?? 'No customer'}</div>
        </div>
      ),
    },
    { key: 'description', header: 'Description', render: (r) => <span className="text-slate-700">{r.description || '—'}</span> },
    { key: 'orderStatus', header: 'Order Status', render: (r) => <StatusBadge tone="neutral">{r.orderStatus.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'bomStatus', header: 'BOM Status', render: (r) => <StatusBadge tone={BOM_STATUS_TONE[r.bomStatus]}>{BOM_STATUS_LABEL[r.bomStatus]}</StatusBadge> },
    { key: 'counts', header: 'Stages / Materials', render: (r) => <span className="text-sm text-slate-600">{r.stageCount} / {r.materialCount}</span> },
    { key: 'cost', header: 'Est. Cost', render: (r) => <span className="font-mono text-sm">{r.estimatedCostLabel ?? '—'}</span> },
    { key: 'actions', header: '', render: (r) => <Link href={`/mis/bom/${r.orderId}`} className="text-sm text-blue-600 hover:underline whitespace-nowrap">View BOM →</Link> },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto text-slate-900">
      <h1 className="text-2xl font-semibold mb-6 text-slate-900">Bill of Materials</h1>
      <form method="get" className="mb-4 flex items-center gap-3">
        {paging && <HiddenParams params={paging.params} />}
        <input
          type="search"
          placeholder="Search orders…"
          name="q"
          defaultValue={search}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <button type="submit" className="min-h-12 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Search</button>
      </form>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.orderId} emptyTitle="No active orders" emptyBody="Active orders will appear here once created." />
      {paging && <Pagination basePath="/mis/bom" params={paging.params} page={paging.page} total={paging.total} />}
    </div>
  );
}
