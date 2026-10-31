'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { createGrnAction } from '@/app/(mis)/mis/grn/actions';
import { unwrap } from '@/lib/mis/action-result';
import { useRouter } from 'next/navigation';

type Grn = { id: string; grnNumber: string; status: string; createdAt: Date; po: { id: string; poNumber: string; supplier: { name: string } | null } | null };
type ApprovedPo = { id: string; poNumber: string; supplier: { id: string; name: string } | null };
type Props = { grns: Grn[]; approvedPos: ApprovedPo[]; canWrite: boolean;
  /** R2-83: the server-side page — total matching rows, the page number, and the URL params kept in the page links. */
  paging?: { total: number; page: number; params: Record<string, string | undefined> }; };

export function GrnListScreen({ grns, approvedPos, canWrite, paging }: Props) {
  const router = useRouter();
  const search = paging?.params.q ?? '';
  const filtered = grns;

  function downloadCsv() {
    const headers = ['GRN #', 'PO #', 'Supplier', 'Status', 'Date'];
    const rows = grns.map(g => [g.grnNumber, g.po?.poNumber ?? '', g.po?.supplier?.name ?? '', g.status, new Date(g.createdAt).toLocaleDateString('en-IN')]);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'grns.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  const [open, setOpen] = useState(false);
  const [poId, setPoId] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!poId) return;
    setCreateError(null);
    startTransition(async () => {
      try {
        const id = unwrap(await createGrnAction(poId, notes || null));
        setOpen(false);
        router.push(`/mis/grn/${id}`);
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : 'That did not save.');
      }
    });
  };

  const columns: Column<Grn>[] = [
    { key: 'grnNumber', header: 'GRN #', render: (r) => <span className="font-mono text-sm">{r.grnNumber}</span> },
    { key: 'po', header: 'PO #', render: (r) => r.po ? <Link href={`/mis/po/${r.po.id}`} className="text-blue-600 hover:underline text-sm">{r.po.poNumber}</Link> : '—' },
    { key: 'supplier', header: 'Supplier', render: (r) => r.po?.supplier?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={r.status === 'CONFIRMED' ? 'good' : r.status === 'REVERSED' ? 'critical' : 'neutral'}>{r.status}</StatusBadge> }, // R2-277
    { key: 'createdAt', header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: (r) => <Link href={`/mis/grn/${r.id}`} className="text-sm text-blue-600 hover:underline">View</Link> },
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Goods Receipt Notes</h1>
        {canWrite && approvedPos.length > 0 && <Button onClick={() => setOpen(true)}>+ New GRN</Button>}
      </div>
      <form method="get" className="flex items-center gap-3">
        {paging && <HiddenParams params={paging.params} />}
        <input
          type="search"
          placeholder="Search GRNs…"
          name="q"
          defaultValue={search}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <Button type="submit" variant="secondary">Search</Button>
        <Button type="button" variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
      </form>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No GRNs yet" emptyBody="GRNs are created from approved purchase orders." />
      {paging && <Pagination basePath="/mis/grn" params={paging.params} page={paging.page} total={paging.total} />}
      <SlideOver open={open} onClose={() => setOpen(false)} title="New GRN">
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Purchase Order"
            value={poId}
            onChange={setPoId}
            options={[{ value: '', label: '— Select PO —' }, ...approvedPos.map(p => ({ value: p.id, label: `${p.poNumber} — ${p.supplier?.name ?? 'No supplier'}` }))]}
          />
          <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          {createError && <p role="alert" className="text-sm text-red-600">{createError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={isPending || !poId}>{isPending ? 'Creating…' : 'Create GRN'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
