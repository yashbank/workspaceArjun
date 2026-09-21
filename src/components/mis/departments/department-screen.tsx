'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { saveDeptAction, deleteDeptAction, restoreDeptAction } from '@/app/(mis)/mis/masters/departments/actions';

type Dept = { id: string; code: string; name: string; nameHi: string | null; isActive: boolean; sortOrder: number; deletedAt: Date | null };
type Props = { depts: Dept[]; canWrite: boolean };

export function DepartmentScreen({ depts, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = search.trim()
    ? depts.filter(d => d.code.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase()) || (d.nameHi ?? '').toLowerCase().includes(search.toLowerCase()))
    : depts;

  const openAdd = () => { setEditing(null); setCode(''); setName(''); setNameHi(''); setSortOrder('0'); setOpen(true); };
  const openEdit = (d: Dept) => { setEditing(d); setCode(d.code); setName(d.name); setNameHi(d.nameHi ?? ''); setSortOrder(String(d.sortOrder)); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => {
      await saveDeptAction(editing?.id ?? null, { code, name, nameHi: nameHi || undefined, sortOrder: parseInt(sortOrder) || 0 });
      setOpen(false);
    });
  };

  const columns: Column<Dept>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'sortOrder', header: 'Order', render: (r) => r.sortOrder },
    { key: 'isActive', header: 'Status', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteDeptAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreDeptAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Departments</h1>
        {canWrite && <Button onClick={openAdd}>+ Add Department</Button>}
      </div>
      <div>
        <input type="search" placeholder="Search departments…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No departments yet" emptyBody="Add your first department to get started." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Department' : 'Add Department'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="PRESS" required />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Press Department" required />
          <Input label="Name (Hindi)" value={nameHi} onChange={(e) => setNameHi(e.target.value)} placeholder="प्रेस विभाग" />
          <NumberInput label="Sort Order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !name || !code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
