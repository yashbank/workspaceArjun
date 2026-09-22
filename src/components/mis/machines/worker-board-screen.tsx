'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { useT } from '@/components/mis/shell/locale-provider';
import { assignWorkersAction, releaseWorkerAction } from '@/app/(mis)/mis/crew/actions';

type Shift = { id: string; name: string };

type StaffedMachine = {
  machineId: string;
  machineAllocationId: string;
  machineName: string;
  orderNumber: string | null;
  jobRef: string | null;
};

type AvailabilityRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  clockedIn: boolean;
  allocation: {
    workerAllocationId: string;
    machineId: string;
    machineName: string;
    orderNumber: string | null;
    processName: string | null;
  } | null;
};

type OverlapWarning = {
  employeeId: string;
  employeeName: string;
  conflictingAllocationId: string;
  conflictingMachineName: string;
  conflictingProcessName: string | null;
  conflictingOrderNumber: string | null;
};

export type WorkerBoardScreenProps = {
  shifts: Shift[];
  currentShiftId: string | null;
  machines: StaffedMachine[];
  availability: AvailabilityRow[];
  canWrite: boolean;
  allocationDate: string;
};

/**
 * The crew board — worker availability plus one-action crew assignment
 * (MIS-263). A phone-width work screen, not a home screen: this is the
 * desktop/tablet card-list pattern `production-screen.tsx` and
 * `order-detail-screen.tsx` already use, not the home card stack from
 * `MIS_UI_SPEC.md` §4.
 */
export function WorkerBoardScreen({
  shifts,
  currentShiftId,
  machines,
  availability,
  canWrite,
  allocationDate,
}: WorkerBoardScreenProps) {
  const t = useT();
  const [openMachine, setOpenMachine] = useState<StaffedMachine | null>(null);

  const freeWorkers = availability.filter((w) => !w.allocation);

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{t('crew.title')}</h1>
        {shifts.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1">
            {shifts.map((s) => (
              <Link
                key={s.id}
                href={`/mis/crew?shift=${s.id}`}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-base font-medium ${
                  s.id === currentShiftId ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('crew.staffedMachines')}
        </h2>
        {machines.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
            {t('crew.noMachinesStaffed')}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {machines.map((m) => {
              const crew = availability.filter((w) => w.allocation?.machineId === m.machineId);
              return (
                <div key={m.machineAllocationId} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{m.machineName}</div>
                    <div className="truncate text-xs text-gray-500">
                      {m.orderNumber ?? m.jobRef ?? '—'} · {crew.length} {t('crew.assignedCount')}
                    </div>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" onClick={() => setOpenMachine(m)}>
                      {t('crew.assignCrew')}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('crew.free')} ({freeWorkers.length})
        </h2>
        {availability.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
            {t('crew.noWorkers')}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {availability.map((w) => (
              <WorkerRow key={w.employeeId} worker={w} canWrite={canWrite} />
            ))}
          </div>
        )}
      </section>

      {openMachine && (
        <AssignCrewSlideOver
          machine={openMachine}
          availability={availability}
          shiftId={currentShiftId}
          allocationDate={allocationDate}
          onClose={() => setOpenMachine(null)}
        />
      )}
    </div>
  );
}

function WorkerRow({ worker, canWrite }: { worker: AvailabilityRow; canWrite: boolean }) {
  const t = useT();
  const [isPending, startTransition] = useTransition();

  const handleRelease = () => {
    if (!worker.allocation) return;
    startTransition(() => releaseWorkerAction(worker.allocation!.workerAllocationId));
  };

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <span className="truncate">{worker.name}</span>
          <span className="font-mono text-xs text-gray-400">{worker.employeeCode}</span>
        </div>
        <div className="truncate text-xs text-gray-500">
          {worker.allocation
            ? `${t('crew.assignedTo')} ${worker.allocation.machineName}${worker.allocation.orderNumber ? ` · ${worker.allocation.orderNumber}` : ''}`
            : t('crew.free')}
          {' · '}
          <span className={worker.clockedIn ? 'text-green-600' : 'text-gray-400'}>
            {worker.clockedIn ? t('crew.clockedIn') : t('crew.notClockedIn')}
          </span>
        </div>
      </div>
      {canWrite && worker.allocation && (
        <Button variant="ghost" disabled={isPending} onClick={handleRelease}>
          {t('crew.release')}
        </Button>
      )}
    </div>
  );
}

function AssignCrewSlideOver({
  machine,
  availability,
  shiftId,
  allocationDate,
  onClose,
}: {
  machine: StaffedMachine;
  availability: AvailabilityRow[];
  shiftId: string | null;
  allocationDate: string;
  onClose: () => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warnings, setWarnings] = useState<OverlapWarning[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (employeeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const alreadyHereIds = useMemo(
    () => new Set(availability.filter((w) => w.allocation?.machineId === machine.machineId).map((w) => w.employeeId)),
    [availability, machine.machineId],
  );

  const submit = (confirmOverlapFor: string[] = []) => {
    if (!shiftId) return;
    startTransition(async () => {
      setError(null);
      try {
        const result = await assignWorkersAction({
          machineAllocationId: machine.machineAllocationId,
          employeeIds: [...selected],
          shiftId,
          allocationDate,
          confirmOverlapFor,
        });
        if (result.warnings.length > 0) {
          setWarnings(result.warnings);
          return;
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not assign the crew.');
      }
    });
  };

  return (
    <SlideOver open onClose={onClose} title={`${t('crew.assignCrew')} — ${machine.machineName}`}>
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {machine.orderNumber ?? machine.jobRef ?? '—'}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {t('crew.selectWorkers')}
          </p>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {availability.map((w) => {
              const hereAlready = alreadyHereIds.has(w.employeeId);
              return (
                <label
                  key={w.employeeId}
                  className={`flex items-center gap-3 px-3 py-2.5 text-sm ${hereAlready ? 'opacity-50' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(w.employeeId) || hereAlready}
                    disabled={hereAlready}
                    onChange={() => toggle(w.employeeId)}
                    className="h-5 w-5 rounded border-gray-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-gray-900">{w.name}</span>
                    <span className="block text-xs text-gray-500">
                      {hereAlready
                        ? `${t('crew.assignedTo')} ${machine.machineName}`
                        : w.allocation
                          ? `${t('crew.assignedTo')} ${w.allocation.machineName}`
                          : t('crew.free')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {warnings.map((w) => (
              <p key={w.employeeId} className="mb-1">
                <strong>{w.employeeName}</strong> {t('crew.overlapWarning')} {w.conflictingMachineName}
                {w.conflictingOrderNumber ? ` (${w.conflictingOrderNumber})` : ''}
                {w.conflictingProcessName ? ` ${t('crew.overlapWarningFor')} ${w.conflictingProcessName}` : ''}.
              </p>
            ))}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => submit(warnings.map((w) => w.employeeId))}
                disabled={isPending}
                className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900"
              >
                {t('crew.confirmAnyway')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const w of warnings) next.delete(w.employeeId);
                    return next;
                  });
                  setWarnings([]);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                {t('crew.skip')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={() => submit()} disabled={isPending || selected.size === 0 || !shiftId}>
            {t('crew.assign')} ({selected.size})
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('crew.close')}
          </Button>
        </div>
      </div>
    </SlideOver>
  );
}
