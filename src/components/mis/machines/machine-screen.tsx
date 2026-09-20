'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { saveMachineAction, deleteMachineAction, restoreMachineAction } from '@/app/(mis)/mis/masters/machines/actions';

type Machine = { id: string; code: string; name: string; departmentId: string | null; machineType: string | null; capacityPerDay: unknown; isActive: boolean; deletedAt: Date | null; department: { id: string; name: string } | null };
type Dept = { id: string; name: string };
type Props = { machines: Machine[]; depts: Dept[]; canWrite: boolean };

export function MachineScreen({ machines, depts, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [deptId, setDeptId] = useState('');
  const [machineType, setMachineType] = useState('');
  const [capacity, setCapacity] = useState('');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const filtered = search.trim()
    ? machines.filter(m => m.code.toLowerCase().includes(search.toLowerCase()) || m.name.toLowerCase().includes(search.toLowerCase()) || (m.department?.name ?? '').toLowerCase().includes(search.toLowerCase()) || (m.machineType ?? '').toLowerCase().includes(search.toLowerCase()))
    : machines;

  const deptOptions: SelectOption[] = [{ value: '', label: '— None —' }, ...depts.map(d => ({ value: d.id, label: d.name }))];

  const openAdd = () => { setEditing(null); setCode(''); setName(''); setDeptId(''); setMachineType(''); setCapacity(''); setOpen(true); };
  const openEdit = (m: Machine) => { setEditing(m); setCode(m.code); setName(m.name); setDeptId(m.departmentId ?? ''); setMachineType(m.machineType ?? ''); setCapacity(m.capacityPerDay ? String(m.capacityPerDay) : ''); setOpen(true); };

  const handleSave = () => {
    startTransition(async () => {
      await saveMachineAction(editing?.id ?? null, { code, name, departmentId: deptId || undefined, machineType: machineType || undefined, capacityPerDay: capacity ? parseFloat(capacity) : undefined });
      setOpen(false);
    });
  };

  const columns: Column<Machine>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Name', render: (r) => r.name },
    { key: 'dept', header: 'Department', render: (r) => r.department?.name ?? '—' },
    { key: 'type', header: 'Type', render: (r) => r.machineType ?? '—' },
    { key: 'capacity', header: 'Capacity/Day', render: (r) => r.capacityPerDay ? String(r.capacityPerDay) : '—' },
    { key: 'isActive', header: 'Status', render: (r) => <StatusBadge tone={r.isActive ? 'good' : 'neutral'}>{r.isActive ? 'Active' : 'Inactive'}</StatusBadge> },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {!r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await deleteMachineAction(r.id); })}>Delete</Button>}
        {r.deletedAt && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await restoreMachineAction(r.id); })}>Restore</Button>}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Machines</h1>
        {canWrite && <Button onClick={openAdd}>+ Add Machine</Button>}
      </div>
      <div>
        <input type="search" placeholder="Search machines…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No machines yet" emptyBody="Add your first machine." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Machine' : 'Add Machine'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Select label="Department" value={deptId} options={deptOptions} onChange={setDeptId} />
          <Input label="Machine Type" value={machineType} onChange={(e) => setMachineType(e.target.value)} />
          <NumberInput label="Capacity/Day" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !name || !code}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
