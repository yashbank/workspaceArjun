'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { saveProcessAction, deleteProcessAction, restoreProcessAction } from '@/app/(mis)/mis/masters/processes/actions';

type Process = { id: string; code: string; name: string; nameHi: string | null; departmentId: string | null; standardTimeMinutes: number | null; isActive: boolean; deletedAt: Date | null; department: { name: string } | null };
type Dept = { id: string; name: string };
type Props = { processes: Process[]; depts: Dept[]; canWrite: boolean };

export function ProcessScreen({ processes, depts, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Process | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [nameHi, setNameHi] = useState('');
  const [deptId, setDeptId] = useState('');
  const [stdTime, setStdTime] = useState('');
  const [isPending, startTransition] = useTransition();

  const deptOptions: SelectOption[] = [{ value: '', label: '— None —' }, ...depts.map(d => ({ value: d.id, label: d.name }))];

  const openAdd = () => { setEditing(null); setCode(''); setName(''); setNameHi(''); setDeptId(''); setStdTime(''); setOpen(true); };
  const openEdit = (p: Process) => { setEditing(p); setCode(p.code); setName(p.name); setNameHi(p.nameHi ?? ''); setDeptId(p.departmentId ?? ''); setStdTime(p.standardTimeMinutes?.toString() ?? ''); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => {
      await saveProcessAction(editing?.id ?? null, { code, name, nameHi: nameHi || undefined, departmentId: deptId || undefined, standardTimeMinutes: stdTime ? parseInt(stdTime) : undefined });
      setOpen(false);
    });
  };

  const columns: Column<Process>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => <div><div>{r.name}</div>{r.nameHi && <div className="text-xs text-slate-500">{r.nameHi}</div>}</div> },
    { key: 'dept', header: 'Department', render: (r) => <span>{r.department?.name ?? '—'}</span> },
    { key: 'time', header: 'Std. Time (min)', render: (r) => <span>{r.standardTimeMinutes ?? '—'}</span> },
    { key: 'isActive', header: 'Active', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteProcessAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreProcessAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Processes</h1>
        {canWrite && <Button onClick={openAdd}>+ Add Process</Button>}
      </div>
      <DataTable columns={columns} rows={processes} rowKey={(r) => r.id} emptyTitle="No processes yet" emptyBody="Add manufacturing processes." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Process' : 'Add Process'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Name (Hindi)" value={nameHi} onChange={(e) => setNameHi(e.target.value)} />
          <Select label="Department" value={deptId} options={deptOptions} onChange={setDeptId} />
          <NumberInput label="Std. Time (min)" value={stdTime} onChange={(e) => setStdTime(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !name || !code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
