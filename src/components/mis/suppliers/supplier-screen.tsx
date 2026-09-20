'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { saveSupplierAction, deleteSupplierAction, restoreSupplierAction } from '@/app/(mis)/mis/suppliers/actions';

type Supplier = { id: string; code: string; name: string; phone: string | null; city: string | null; gstNo: string | null; paymentTermsDays: number | null; isActive: boolean; deletedAt: Date | null };
type Props = { suppliers: Supplier[]; canWrite: boolean };

export function SupplierScreen({ suppliers, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [vals, setVals] = useState({ code: '', name: '', phone: '', address: '', city: '', gstNo: '', paymentDays: '' });
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = search.trim()
    ? suppliers.filter(s => s.code.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase()) || (s.city ?? '').toLowerCase().includes(search.toLowerCase()) || (s.phone ?? '').toLowerCase().includes(search.toLowerCase()))
    : suppliers;

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }));

  const openAdd = () => { setEditing(null); setVals({ code: '', name: '', phone: '', address: '', city: '', gstNo: '', paymentDays: '' }); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setVals({ code: s.code, name: s.name, phone: s.phone ?? '', address: '', city: s.city ?? '', gstNo: s.gstNo ?? '', paymentDays: s.paymentTermsDays?.toString() ?? '' }); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => {
      await saveSupplierAction(editing?.id ?? null, { code: vals.code, name: vals.name, phone: vals.phone || undefined, address: vals.address || undefined, city: vals.city || undefined, gstNo: vals.gstNo || undefined, paymentTermsDays: vals.paymentDays ? parseInt(vals.paymentDays) : undefined });
      setOpen(false);
    });
  };

  function downloadCsv() {
    const headers = ['Code', 'Name', 'City', 'Phone', 'GST No', 'Payment Terms (days)', 'Active'];
    const rows = suppliers.map(s => [s.code, s.name, s.city ?? '', s.phone ?? '', s.gstNo ?? '', s.paymentTermsDays?.toString() ?? '', s.isActive ? 'Yes' : 'No']);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'suppliers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Supplier>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => <span>{r.name}</span> },
    { key: 'city', header: 'City', render: (r) => <span>{r.city ?? '—'}</span> },
    { key: 'phone', header: 'Phone', render: (r) => <span>{r.phone ?? '—'}</span> },
    { key: 'terms', header: 'Payment Terms', render: (r) => <span>{r.paymentTermsDays ? `${r.paymentTermsDays} days` : '—'}</span> },
    { key: 'isActive', header: 'Active', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        <Link href={`/mis/suppliers/${r.id}`}><Button variant="ghost">View</Button></Link>
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteSupplierAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreSupplierAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Suppliers</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
          {canWrite && <Button onClick={openAdd}>+ Add Supplier</Button>}
        </div>
      </div>
      <div>
        <input type="search" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No suppliers yet" emptyBody="Add suppliers to raise purchase orders." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Supplier' : 'Add Supplier'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={vals.code} onChange={set('code')} required />
          <Input label="Name" value={vals.name} onChange={set('name')} required />
          <Input label="Phone" value={vals.phone} onChange={set('phone')} />
          <Input label="Address" value={vals.address} onChange={set('address')} />
          <Input label="City" value={vals.city} onChange={set('city')} />
          <Input label="GST No" value={vals.gstNo} onChange={set('gstNo')} />
          <NumberInput label="Payment Terms (days)" value={vals.paymentDays} onChange={set('paymentDays')} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !vals.name || !vals.code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
