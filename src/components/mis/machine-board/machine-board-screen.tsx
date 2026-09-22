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

  // P1: free = green, running = amber, offline = grey. Red is reserved for a breakdown, which this board has no data for.
  const dotColor = machine.status === 'FREE' ? 'bg-green-500' : machine.status === 'BUSY' ? 'bg-amber-500' : 'bg-slate-300';
  const stateLabel = machine.status === 'FREE' ? 'Free' : machine.status === 'BUSY' ? 'Running' : 'Offline';
  const stateText = machine.status === 'FREE' ? 'text-green-700' : machine.status === 'BUSY' ? 'text-amber-800' : 'text-slate-500';

  return (
    <div className="rounded-2xl border border-slate-200 p-4 flex flex-col gap-1.5 bg-white">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className={`text-sm font-medium ${stateText}`}>{stateLabel}</span>
        <span className="ml-auto whitespace-nowrap font-mono text-xs text-slate-500">{machine.code}</span>
      </div>
      <p className="text-base font-semibold text-slate-900 break-words">{machine.name}</p>
      {(machine.department || machine.machineType) && (
        <p className="text-sm text-slate-600">{[machine.department?.name, machine.machineType].filter(Boolean).join(' · ')}</p>
      )}
      {machine.status === 'BUSY' && machine.currentAllocation && (
        <div className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs text-amber-900">
          {machine.currentAllocation.order?.orderNumber ?? machine.currentAllocation.jobRef ?? 'Unknown job'}
          {' · '}until {new Date(machine.currentAllocation.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </div>
      )}
      <Link href={`/mis/machine-board/${machine.id}`} className="inline-flex min-h-11 items-center self-start text-sm font-medium text-indigo-700 hover:underline">History →</Link>
      {canWrite && (
        <div className="flex gap-2">
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
          <span className="flex items-center gap-1.5 font-mono text-slate-700"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-green-500" />{free} free</span>
          <span className="flex items-center gap-1.5 font-mono text-slate-700"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-amber-500" />{busy} running</span>
        </div>
      </div>
      <div>
        <input type="search" placeholder="Search machines…" value={search} onChange={e => setSearch(e.target.value)} className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(m => <MachineCard key={m.id} machine={m} canWrite={canWrite} />)}
      </div>
      {filtered.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">{search ? 'No machines match your search.' : 'No machines configured yet.'}</div>}
    </div>
  );
}
