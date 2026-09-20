'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { saveItemAction, deleteItemAction, restoreItemAction } from '@/app/(mis)/mis/masters/items/actions';

type Item = { id: string; code: string; name: string; gsm: string | null; size: string | null; substrate: string | null; coating: string | null; unit: string; isActive: boolean; deletedAt: Date | null };
type Props = { items: Item[]; canWrite: boolean };

const UNIT_OPTIONS: SelectOption[] = [{ value: 'KG', label: 'KG' }, { value: 'PCS', label: 'PCS' }, { value: 'MTR', label: 'MTR' }, { value: 'SHEET', label: 'SHEET' }];

export function ItemScreen({ items, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [vals, setVals] = useState({ code: '', name: '', gsm: '', size: '', substrate: '', coating: '', unit: 'KG' });
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = search.trim()
    ? items.filter(it => it.code.toLowerCase().includes(search.toLowerCase()) || it.name.toLowerCase().includes(search.toLowerCase()) || (it.gsm ?? '').toLowerCase().includes(search.toLowerCase()) || (it.substrate ?? '').toLowerCase().includes(search.toLowerCase()))
    : items;

  const set = (k: keyof typeof vals) => (e: React.ChangeEvent<HTMLInputElement>) => setVals(v => ({ ...v, [k]: e.target.value }));

  const openAdd = () => { setEditing(null); setVals({ code: '', name: '', gsm: '', size: '', substrate: '', coating: '', unit: 'KG' }); setOpen(true); };
  const openEdit = (it: Item) => { setEditing(it); setVals({ code: it.code, name: it.name, gsm: it.gsm ?? '', size: it.size ?? '', substrate: it.substrate ?? '', coating: it.coating ?? '', unit: it.unit }); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => { await saveItemAction(editing?.id ?? null, vals); setOpen(false); });
  };

  const columns: Column<Item>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'gsm', header: 'GSM', render: (r) => r.gsm ?? '—' },
    { key: 'size', header: 'Size', render: (r) => r.size ?? '—' },
    { key: 'unit', header: 'Unit', render: (r) => r.unit },
    { key: 'isActive', header: 'Status', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteItemAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreItemAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Items</h1>
        {canWrite && <Button onClick={openAdd}>+ Add Item</Button>}
      </div>
      <div>
        <input type="search" placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No items yet" emptyBody="Add stock items to manage inventory." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Item' : 'Add Item'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={vals.code} onChange={set('code')} required />
          <Input label="Name" value={vals.name} onChange={set('name')} required />
          <Input label="GSM" value={vals.gsm} onChange={set('gsm')} />
          <Input label="Size" value={vals.size} onChange={set('size')} />
          <Input label="Substrate" value={vals.substrate} onChange={set('substrate')} />
          <Input label="Coating" value={vals.coating} onChange={set('coating')} />
          <Select label="Unit" value={vals.unit} options={UNIT_OPTIONS} onChange={(v) => setVals(p => ({ ...p, unit: v }))} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !vals.name || !vals.code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
