'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { createGrnAction } from '@/app/(mis)/mis/grn/actions';
import { useRouter } from 'next/navigation';

type Grn = { id: string; grnNumber: string; status: string; createdAt: Date; po: { id: string; poNumber: string; supplier: { name: string } | null } | null };
type ApprovedPo = { id: string; poNumber: string; supplier: { id: string; name: string } | null };
type Props = { grns: Grn[]; approvedPos: ApprovedPo[]; canWrite: boolean };

export function GrnListScreen({ grns, approvedPos, canWrite }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? grns.filter(g => g.grnNumber.toLowerCase().includes(search.toLowerCase()) || (g.po?.poNumber ?? '').toLowerCase().includes(search.toLowerCase()) || (g.po?.supplier?.name ?? '').toLowerCase().includes(search.toLowerCase()))
    : grns;

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

  const handleCreate = () => {
    if (!poId) return;
    startTransition(async () => {
      const id = await createGrnAction(poId, notes || null);
      setOpen(false);
      router.push(`/mis/grn/${id}`);
    });
  };

  const columns: Column<Grn>[] = [
    { key: 'grnNumber', header: 'GRN #', render: (r) => <span className="font-mono text-sm">{r.grnNumber}</span> },
    { key: 'po', header: 'PO #', render: (r) => r.po ? <Link href={`/mis/po/${r.po.id}`} className="text-blue-600 hover:underline text-sm">{r.po.poNumber}</Link> : '—' },
    { key: 'supplier', header: 'Supplier', render: (r) => r.po?.supplier?.name ?? '—' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={r.status === 'CONFIRMED' ? 'good' : 'neutral'}>{r.status}</StatusBadge> },
    { key: 'createdAt', header: 'Date', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: (r) => <Link href={`/mis/grn/${r.id}`} className="text-sm text-blue-600 hover:underline">View</Link> },
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Goods Receipt Notes</h1>
        {canWrite && approvedPos.length > 0 && <Button onClick={() => setOpen(true)}>+ New GRN</Button>}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search GRNs…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No GRNs yet" emptyBody="GRNs are created from approved purchase orders." />
      <SlideOver open={open} onClose={() => setOpen(false)} title="New GRN">
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Purchase Order"
            value={poId}
            onChange={setPoId}
            options={[{ value: '', label: '— Select PO —' }, ...approvedPos.map(p => ({ value: p.id, label: `${p.poNumber} — ${p.supplier?.name ?? 'No supplier'}` }))]}
          />
          <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleCreate} disabled={isPending || !poId}>{isPending ? 'Creating…' : 'Create GRN'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
