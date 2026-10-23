'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { createPoAction } from '@/app/(mis)/mis/po/actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { isBomNotApprovedDetail } from '@/lib/mis/po-errors';
import { poPurpose, poPurposeLabel, type PoPurpose } from '@/lib/mis/po-purpose';
import { useRouter } from 'next/navigation';

type Po = { id: string; poNumber: string; status: string; bomRef: string | null; supplier: { id: string; name: string } | null; _count: { items: number }; createdAt: Date };
type Supplier = { id: string; name: string };
type ApprovedBom = { orderNumber: string; bomNumber: string | null; label: string };
type Props = { pos: Po[]; suppliers: Supplier[]; canWrite: boolean; approvedBoms?: ApprovedBom[];
  /** R2-83: the server-side page — total matching rows, the page number, and the URL params kept in the page links. */
  paging?: { total: number; page: number; params: Record<string, string | undefined> }; };

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'PENDING_APPROVAL': return 'warning';
    case 'APPROVED': return 'good';
    case 'RECEIVING': return 'info';
    case 'PARTIAL': return 'info';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function PoListScreen({ pos, suppliers, canWrite, approvedBoms = [], paging }: Props) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { toast } = useToast();
  const search = paging?.params.q ?? '';
  const filtered = pos;

  function downloadCsv() {
    const headers = ['PO #', 'Supplier', 'Purpose', 'BOM Ref', 'Status', 'Items', 'Created'];
    const rows = pos.map(p => [p.poNumber, p.supplier?.name ?? '', poPurposeLabel(poPurpose(p)), p.bomRef ?? '', p.status, String(p._count.items), new Date(p.createdAt).toLocaleDateString('en-IN')]);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'purchase-orders.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purpose, setPurpose] = useState<PoPurpose>('FOR_ORDER');
  const [bomRef, setBomRef] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    if (!supplierId) { toast('error', 'Please select a supplier.'); return; }
    startTransition(async () => {
      const result = await createPoAction({ supplierId: supplierId || null, purpose, bomRef: purpose === 'FOR_ORDER' ? bomRef || null : null, notes: notes || null });
      if (!result.ok) {
        // D1: an unapproved BOM is a popup the raiser must acknowledge; any other refusal is a toast.
        if (isBomNotApprovedDetail(result.detail)) {
          await confirm({ title: 'BOM is not approved', message: result.detail, confirmLabel: 'OK', cancelLabel: 'Close' });
        } else {
          toast('error', result.detail);
        }
        return;
      }
      setOpen(false);
      router.push(`/mis/po/${result.value}`);
    });
  };

  const columns: Column<Po>[] = [
    { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-sm">{r.poNumber}</span> },
    { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name ?? '—' },
    { key: 'purpose', header: 'Purpose', render: (r) => (
      r.bomRef
        ? <span className="text-sm text-slate-700">From BOM <span className="font-mono text-xs text-slate-500">{r.bomRef}</span></span>
        : <span className="text-sm text-slate-700">Buffer stock</span>
    )},
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'items', header: 'Items', render: (r) => r._count.items },
    { key: 'createdAt', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: (r) => <Link href={`/mis/po/${r.id}`} className="text-sm text-blue-600 hover:underline">View</Link> },
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Purchase Orders</h1>
        {canWrite && <Button onClick={() => setOpen(true)}>+ New PO</Button>}
      </div>
      <form method="get" className="flex items-center gap-3">
        {paging && <HiddenParams params={paging.params} />}
        <input
          type="search"
          placeholder="Search POs…"
          name="q"
          defaultValue={search}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <Button type="submit" variant="secondary">Search</Button>
        <Button type="button" variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
      </form>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No purchase orders" emptyBody="Create a PO from a BOM requirement, or for buffer stock with no BOM behind it." />
      {paging && <Pagination basePath="/mis/po" params={paging.params} page={paging.page} total={paging.total} />}
      <SlideOver open={open} onClose={() => setOpen(false)} title="New Purchase Order">
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Supplier"
            value={supplierId}
            onChange={setSupplierId}
            options={[{ value: '', label: '— Select supplier —' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
          />
          <Select
            label="Purpose"
            value={purpose}
            onChange={(v) => setPurpose(v as PoPurpose)}
            options={[
              { value: 'FOR_ORDER', label: 'From a BOM requirement' },
              { value: 'BUFFER_STOCK', label: 'Buffer stock — no BOM' },
            ]}
          />
          {purpose === 'FOR_ORDER' ? (
            approvedBoms.length === 0 ? (
              <EmptyState title="No approved BOMs yet" body="A PO from a BOM needs an order whose BOM is approved. For a stock top-up, choose Buffer stock instead." />
            ) : (
              <Select
                label="BOM Ref"
                value={bomRef}
                onChange={setBomRef}
                options={[{ value: '', label: '— Select an order with an approved BOM —' }, ...approvedBoms.map(b => ({ value: b.bomNumber ?? b.orderNumber, label: b.label }))]}
              />
            )
          ) : (
            <p className="text-sm text-slate-500">
              Stock kept on hand. No BOM and no customer order is recorded against this PO.
            </p>
          )}
          <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={isPending || (purpose === 'FOR_ORDER' && !bomRef.trim())}>{isPending ? 'Creating…' : 'Create PO'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
      {confirmDialog}
    </div>
  );
}
