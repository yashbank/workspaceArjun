import Link from 'next/link';

import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { NOT_LINKED_TO_ORDER } from '@/lib/mis/general-use';

export type RequestListRow = {
  id: string;
  requestNumber: string;
  status: string;
  createdAt: Date;
  order: { id: string; orderNumber: string } | null;
  department: { id: string; name: string } | null;
  isGeneral?: boolean;
  generalReason?: string | null;
  costCenter?: string | null;
  pickList?: { id: string; status: string } | null;
  lines: { id: string; requestedQty: number; actualIssuedQty: number | null; item: { name: string } }[];
};

export const STATUS_TONE: Record<string, BadgeTone> = { PENDING: 'warning', APPROVED: 'good', REJECTED: 'critical' };

export function RequestListScreen({ requests, canDecide }: { requests: RequestListRow[]; canDecide: boolean }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Material requests</h1>
          <p className="mt-0.5 text-sm text-slate-500">{canDecide ? 'Approve for picking (stock moves when the pick list is handed over), approve & issue now, or reject.' : 'Every material request and its status.'}</p>
        </div>
        <Link href="/mis/store/requests/new" className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white">
          + New request
        </Link>
      </div>
      {requests.length === 0 && <p className="text-sm text-slate-500">No requests yet.</p>}
      {requests.map((r) => (
        <Link key={r.id} href={`/mis/store/requests/${r.id}`} className="flex min-h-11 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-slate-900">{r.requestNumber}</span>
            <StatusBadge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</StatusBadge>
          </div>
          <div className="text-sm text-slate-600">
            {r.lines.length} {r.lines.length === 1 ? 'line' : 'lines'}
            {r.order && <> · Order <span className="font-mono">{r.order.orderNumber}</span></>}
            {r.department && <> · {r.department.name}</>}
            {r.isGeneral && <> · <span className="font-semibold text-amber-700">General / factory use{r.costCenter ? ` · ${r.costCenter}` : ''}</span> <span className="text-slate-500">({NOT_LINKED_TO_ORDER})</span></>}
            {' · '}{new Date(r.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </div>
          <div className="truncate text-xs text-slate-500">{r.lines.map((l) => `${l.item.name} × ${l.requestedQty}`).join(', ')}</div>
        </Link>
      ))}
    </div>
  );
}
