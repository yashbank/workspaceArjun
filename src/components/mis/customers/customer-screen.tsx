'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { saveCustomerAction, deleteCustomerAction, restoreCustomerAction } from '@/app/(mis)/mis/customers/actions';

type Customer = { id: string; code: string; name: string; nameHi: string | null; phone: string | null; city: string | null; gstNo: string | null; isActive: boolean; deletedAt: Date | null };
type Props = { customers: Customer[]; canWrite: boolean };

export function CustomerScreen({ customers, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [vals, setVals] = useState({ code: '', name: '', nameHi: '', phone: '', address: '', city: '', gstNo: '' });
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = search.trim()
    ? customers.filter(c => c.code.toLowerCase().includes(search.toLowerCase()) || c.name.toLowerCase().includes(search.toLowerCase()) || (c.city ?? '').toLowerCase().includes(search.toLowerCase()) || (c.phone ?? '').toLowerCase().includes(search.toLowerCase()))
    : customers;

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }));

  const openAdd = () => { setEditing(null); setVals({ code: '', name: '', nameHi: '', phone: '', address: '', city: '', gstNo: '' }); setOpen(true); };
  const openEdit = (c: Customer) => { setEditing(c); setVals({ code: c.code, name: c.name, nameHi: c.nameHi ?? '', phone: c.phone ?? '', address: '', city: c.city ?? '', gstNo: c.gstNo ?? '' }); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => { await saveCustomerAction(editing?.id ?? null, vals); setOpen(false); });
  };

  function downloadCsv() {
    const headers = ['Code', 'Name', 'City', 'Phone', 'GST No', 'Active'];
    const rows = customers.map(c => [c.code, c.name, c.city ?? '', c.phone ?? '', c.gstNo ?? '', c.isActive ? 'Yes' : 'No']);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Customer>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'city', header: 'City', render: (r) => r.city ?? '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
    { key: 'gstNo', header: 'GST No', render: (r) => r.gstNo ?? '—' },
    { key: 'isActive', header: 'Active', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        <Link href={`/mis/customers/${r.id}`}><Button variant="ghost">View</Button></Link>
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteCustomerAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreCustomerAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
          {canWrite && <Button onClick={openAdd}>+ Add Customer</Button>}
        </div>
      </div>
      <div>
        <input type="search" placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No customers yet" emptyBody="Add customers to create orders." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Customer' : 'Add Customer'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={vals.code} onChange={set('code')} required />
          <Input label="Name" value={vals.name} onChange={set('name')} required />
          <Input label="Name (Hindi)" value={vals.nameHi} onChange={set('nameHi')} />
          <Input label="Phone" value={vals.phone} onChange={set('phone')} />
          <Input label="Address" value={vals.address} onChange={set('address')} />
          <Input label="City" value={vals.city} onChange={set('city')} />
          <Input label="GST No" value={vals.gstNo} onChange={set('gstNo')} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !vals.name || !vals.code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
