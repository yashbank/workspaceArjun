'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { allocateMachineAction, releaseMachineAction } from '@/app/(mis)/mis/machine-board/actions';

type Machine = {
  id: string; name: string; code: string; machineType: string | null; isActive: boolean;
  status: 'FREE' | 'BUSY' | 'OFFLINE';
  department: { name: string } | null;
  currentAllocation: { id: string; jobRef: string | null; endsAt: Date; order: { orderNumber: string } | null } | null;
};

function MachineCard({ machine, canWrite }: { machine: Machine; canWrite: boolean }) {
  const [allocOpen, setAllocOpen] = useState(false);
  const [jobRef, setJobRef] = useState('');
  const [hours, setHours] = useState('8');
  const [isPending, startTransition] = useTransition();

  const dotColor = machine.status === 'FREE' ? 'bg-green-500' : machine.status === 'BUSY' ? 'bg-red-500' : 'bg-slate-300';

  return (
    <div className="rounded-xl border border-slate-200 p-4 flex flex-col gap-2 bg-white">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="font-medium text-slate-900 truncate">{machine.name}</span>
        <span className="ml-auto text-xs text-slate-400 font-mono">{machine.code}</span>
      </div>
      {machine.department && <span className="text-xs text-slate-500">{machine.department.name}</span>}
      {machine.machineType && <span className="text-xs text-slate-400">{machine.machineType}</span>}
      <Link href={`/mis/machine-board/${machine.id}`} className="text-xs text-slate-400 hover:text-blue-600 hover:underline">History →</Link>
      {machine.status === 'BUSY' && machine.currentAllocation && (
        <div className="text-xs text-slate-600 bg-red-50 rounded px-2 py-1">
          {machine.currentAllocation.order?.orderNumber ?? machine.currentAllocation.jobRef ?? 'Unknown job'}
          {' · '}until {new Date(machine.currentAllocation.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </div>
      )}
      {canWrite && (
        <div className="flex gap-2 mt-1">
          {machine.status === 'FREE' && <Button variant="ghost" onClick={() => setAllocOpen(true)}>Allocate</Button>}
          {machine.status === 'BUSY' && machine.currentAllocation && (
            <Button variant="ghost" onClick={() => startTransition(async () => { await releaseMachineAction(machine.currentAllocation!.id); })}>Release</Button>
          )}
        </div>
      )}
      <SlideOver open={allocOpen} onClose={() => setAllocOpen(false)} title={`Allocate — ${machine.name}`}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Job / Order Ref" value={jobRef} onChange={e => setJobRef(e.target.value)} />
          <NumberInput label="Duration (hours)" value={hours} onChange={e => setHours(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={() => startTransition(async () => {
              const start = new Date(); const end = new Date(start.getTime() + Number(hours) * 3600000);
              await allocateMachineAction({ machineId: machine.id, jobRef: jobRef || undefined, startsAt: start, endsAt: end });
              setAllocOpen(false);
            })} disabled={isPending || !hours}>Confirm</Button>
            <Button variant="ghost" onClick={() => setAllocOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

export function MachineBoardScreen({ machines, canWrite }: { machines: Machine[]; canWrite: boolean }) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? machines.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.code.toLowerCase().includes(search.toLowerCase()) || (m.department?.name ?? '').toLowerCase().includes(search.toLowerCase()) || (m.machineType ?? '').toLowerCase().includes(search.toLowerCase()))
    : machines;
  const free = filtered.filter(m => m.status === 'FREE').length;
  const busy = filtered.filter(m => m.status === 'BUSY').length;

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Machine Board</h1>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />{free} Free</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />{busy} Busy</span>
        </div>
      </div>
      <div>
        <input type="search" placeholder="Search machines…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(m => <MachineCard key={m.id} machine={m} canWrite={canWrite} />)}
      </div>
      {filtered.length === 0 && <div className="text-center text-slate-400 py-12">{search ? 'No machines match your search.' : 'No machines configured yet.'}</div>}
    </div>
  );
}
