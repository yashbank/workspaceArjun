'use client';

import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { pageHref } from '@/lib/mis/pagination';
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

type Counts = { ALL: number; NO_BOM: number; DRAFT: number; PENDING_APPROVAL: number; APPROVED: number };

const TABS: { key: 'ALL' | BomOverviewRow['bomStatus']; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'NO_BOM', label: 'No BOM' },
];

/** R2-142: the row action follows the BOM's state. */
const CTA: Record<BomOverviewRow['bomStatus'], { label: string; edit: boolean; cls: string }> = {
  NO_BOM: { label: '+ Create BOM', edit: true, cls: 'bg-indigo-600 text-white hover:bg-indigo-700' },
  DRAFT: { label: 'Continue Editing', edit: true, cls: 'border border-indigo-600 bg-white text-indigo-700 hover:bg-indigo-50' },
  PENDING_APPROVAL: { label: 'Review & Approve', edit: false, cls: 'bg-indigo-600 text-white hover:bg-indigo-700' },
  APPROVED: { label: 'View BOM', edit: false, cls: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50' },
};

type Paging = { total: number; page: number; params: Record<string, string | undefined> };

/** R2-122/123/137/143: a paged (10/page) BOM list with header-level order + BOM lifecycle data, so a role can tell draft from approved without opening each order. */
export function BomListScreen({ rows, paging, counts }: { rows: BomOverviewRow[]; paging?: Paging; counts?: Counts }) {
  const search = paging?.params.q ?? '';
  const status = paging?.params.status ?? '';

  const columns: Column<BomOverviewRow>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (r) => <Link href={`/mis/bom/${r.orderId}`} className="font-mono text-sm font-bold text-indigo-700 hover:underline whitespace-nowrap">{r.orderNumber}</Link>,
    },
    { key: 'customer', header: 'Customer', render: (r) => <span className="text-slate-700">{r.customerName ?? 'No customer'}</span> },
    {
      key: 'description',
      header: 'Specification',
      render: (r) => <span title={r.description ?? undefined} className="block max-w-xs truncate text-slate-700">{r.description || '—'}</span>,
    },
    { key: 'due', header: 'Due date', render: (r) => <span className="font-mono text-sm text-slate-700 whitespace-nowrap">{r.deliveryDate ?? '—'}</span> },
    { key: 'orderStatus', header: 'Order Status', render: (r) => <StatusBadge tone="neutral">{r.orderStatus.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'bomStatus', header: 'BOM Status', render: (r) => <StatusBadge tone={BOM_STATUS_TONE[r.bomStatus]}>{BOM_STATUS_LABEL[r.bomStatus]}</StatusBadge> },
    { key: 'counts', header: 'Stages / Materials', render: (r) => <span className="text-sm text-slate-600">{r.stageCount} / {r.materialCount}</span> },
    { key: 'cost', header: 'Est. Cost', render: (r) => <span className="font-mono text-sm">{r.estimatedCostLabel ?? '—'}</span> },
    {
      key: 'actions',
      header: '',
      render: (r) => {
        const cta = CTA[r.bomStatus];
        return (
          <Link href={`/mis/bom/${r.orderId}${cta.edit ? '?view=edit' : ''}`} className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold whitespace-nowrap ${cta.cls}`}>
            {cta.label}
          </Link>
        );
      },
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-900">
      <h1 className="text-2xl font-semibold mb-6 text-slate-900">Bill of Materials</h1>
      {counts && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="BOM pipeline summary">
          {[
            ['Active orders', counts.ALL, 'text-slate-900'],
            ['Missing BOMs', counts.NO_BOM, counts.NO_BOM > 0 ? 'text-red-700' : 'text-slate-900'],
            ['Drafts', counts.DRAFT, 'text-amber-800'],
            ['Pending approval', counts.PENDING_APPROVAL, 'text-sky-800'],
          ].map(([label, n, tone]) => (
            <div key={label as string} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm text-slate-600">{label}</div>
              <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
            </div>
          ))}
        </div>
      )}
      {counts && paging && (
        <nav aria-label="Filter by BOM status" className="mb-4 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = (status || 'ALL') === t.key;
            return (
              <Link
                key={t.key}
                href={pageHref('/mis/bom', { ...paging.params, status: t.key === 'ALL' ? undefined : t.key }, 1)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
              >
                {t.label} ({counts[t.key]})
              </Link>
            );
          })}
        </nav>
      )}
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
