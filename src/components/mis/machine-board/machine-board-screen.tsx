'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { NumberInput, Select } from '@/components/mis/kit/input';
import { allocateMachineAction, getOpenPhasesForOrderAction, releaseMachineAction } from '@/app/(mis)/mis/machine-board/actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { formatFactoryTime } from '@/lib/mis/factory-time';
import type { SyncFlag } from '@/lib/mis/machine-sync';

type Machine = {
  id: string; name: string; code: string; machineType: string | null; isActive: boolean;
  status: 'FREE' | 'BUSY' | 'OFFLINE';
  department: { name: string } | null;
  currentAllocation: {
    id: string; jobRef: string | null; endsAt: Date; order: { orderNumber: string } | null;
    /** Names of the people on it now; "Releasing frees N workers: <names>" (R3 B101). */
    crewNames?: string[];
  } | null;
  /** Today's last production log and whether it agrees with the booking (R3 B99, warn only). */
  lastLog?: { orderNumber: string | null; at: Date } | null;
  syncFlag?: SyncFlag | null;
};

/** Where "Assign crew" lands: the factory's current shift day and shift (R3 B101). */
export type CrewLink = { dateKey: string; shiftId: string } | null;

/** The wording of the release confirmation, kept in one place so the test pins it. */
export function releaseMessage(names: string[]): string {
  return `Releasing frees ${names.length} worker${names.length === 1 ? '' : 's'}${names.length > 0 ? `: ${names.join(', ')}` : ''}`;
}

const SYNC_TEXT: Record<'NO_BOOKING' | 'OTHER_ORDER', string> = {
  NO_BOOKING: 'Log without booking',
  OTHER_ORDER: 'Log for another order',
};

type OrderOption = { id: string; orderNumber: string };
type PhaseOption = { id: string; sequence: number; processName: string };

function MachineCard({ machine, canWrite, orders, crewLink, timeZone }: { machine: Machine; canWrite: boolean; orders: OrderOption[]; crewLink: CrewLink; timeZone: string }) {
  const [allocOpen, setAllocOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [jobPhaseId, setJobPhaseId] = useState('');
  const [phasesPending, setPhasesPending] = useState(false);
  const [hours, setHours] = useState('8');
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  // 22.1: picking an order loads ITS open phases — a phase belongs to one order (Appendix A),
  // so the two selects are always cascading, never independent.
  const onOrderChange = (id: string) => {
    setOrderId(id);
    setJobPhaseId('');
    setPhases([]);
    if (!id) return;
    setPhasesPending(true);
    getOpenPhasesForOrderAction(id)
      .then((result) => {
        if (result.ok) setPhases(result.value);
        else setActionError(result.detail);
      })
      .finally(() => setPhasesPending(false));
  };

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
          {' · '}until {formatFactoryTime(new Date(machine.currentAllocation.endsAt), timeZone)}
        </div>
      )}
      {machine.syncFlag && machine.syncFlag !== 'OK' && (
        <div data-testid="sync-chip" className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
          {SYNC_TEXT[machine.syncFlag]}
          {machine.lastLog?.orderNumber ? ` · ${machine.lastLog.orderNumber}` : ''}
        </div>
      )}
      <Link href={`/mis/machine-board/${machine.id}`} className="inline-flex min-h-11 items-center self-start text-sm font-medium text-indigo-700 hover:underline">History →</Link>
      {canWrite && (
        <div className="flex gap-2">
          {machine.status === 'FREE' && <Button variant="ghost" onClick={() => setAllocOpen(true)}>Allocate</Button>}
          {machine.status === 'BUSY' && machine.currentAllocation && crewLink && (
            <Link
              href={`/mis/crew?date=${crewLink.dateKey}&shift=${crewLink.shiftId}&allocation=${machine.currentAllocation.id}`}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-base font-medium text-slate-700 hover:bg-slate-100"
            >
              Assign crew
            </Link>
          )}
          {machine.status === 'BUSY' && machine.currentAllocation && (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={async () => {
                const names = machine.currentAllocation!.crewNames ?? [];
                const ok = await confirm({
                  title: `Release ${machine.name}`,
                  message: releaseMessage(names),
                  confirmLabel: 'Release',
                  destructive: true,
                });
                if (!ok) return;
                startTransition(async () => {
                  setActionError(null);
                  const result = await releaseMachineAction(machine.currentAllocation!.id);
                  if (!result.ok) setActionError(result.detail);
                });
              }}
            >
              Release
            </Button>
          )}
        </div>
      )}
      {actionError && !allocOpen && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
      {confirmDialog}
      <SlideOver open={allocOpen} onClose={() => setAllocOpen(false)} title={`Allocate — ${machine.name}`}>
        <div className="flex flex-col gap-4 p-4">
          <Select label="Order" value={orderId} onChange={e => onOrderChange(e.target.value)}>
            <option value="">Select an order…</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
          </Select>
          <Select
            label="Phase"
            value={jobPhaseId}
            onChange={e => setJobPhaseId(e.target.value)}
            disabled={!orderId || phasesPending}
            hint={orderId && !phasesPending && phases.length === 0 ? 'No open phase on this order.' : undefined}
          >
            <option value="">{phasesPending ? 'Loading…' : 'Select a phase…'}</option>
            {phases.map(p => <option key={p.id} value={p.id}>{p.processName}</option>)}
          </Select>
          <NumberInput label="Duration (hours)" value={hours} onChange={e => setHours(e.target.value)} />
          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
          <div className="flex gap-2">
            <Button onClick={() => startTransition(async () => {
              setActionError(null);
              const start = new Date(); const end = new Date(start.getTime() + Number(hours) * 3600000);
              const result = await allocateMachineAction({
                machineId: machine.id,
                orderId: orderId || undefined,
                jobPhaseId: jobPhaseId || undefined,
                startsAt: start,
                endsAt: end,
              });
              // A refusal ("Machine already allocated from ...") stays in the panel as text.
              if (!result.ok) { setActionError(result.detail); return; }
              setAllocOpen(false);
              setOrderId(''); setJobPhaseId(''); setPhases([]);
            })} disabled={isPending || !hours}>Confirm</Button>
            <Button variant="ghost" onClick={() => setAllocOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}

export function MachineBoardScreen({ machines, canWrite, orders, crewLink = null, timeZone = 'Asia/Kolkata' }: { machines: Machine[]; canWrite: boolean; orders: OrderOption[]; crewLink?: CrewLink; timeZone?: string }) {
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
        {filtered.map(m => <MachineCard key={m.id} machine={m} canWrite={canWrite} orders={orders} crewLink={crewLink} timeZone={timeZone} />)}
      </div>
      {filtered.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">{search ? 'No machines match your search.' : 'No machines configured yet.'}</div>}
    </div>
  );
}
