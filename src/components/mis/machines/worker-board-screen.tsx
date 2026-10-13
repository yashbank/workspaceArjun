'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import {
  assignWorkersAction,
  copyCrewAction,
  moveWorkerAction,
  releaseWorkerAction,
  type AssignWorkersActionResult,
} from '@/app/(mis)/mis/crew/actions';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { useT } from '@/components/mis/shell/locale-provider';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { addDaysToDateKey } from '@/lib/mis/factory-time';
import type { Presence } from '@/lib/mis/presence';

type Shift = { id: string; name: string };

type StaffedMachine = {
  machineId: string;
  machineAllocationId: string;
  machineName: string;
  orderNumber: string | null;
  jobRef: string | null;
};

type AllocationEntry = {
  id: string;
  machineAllocationId: string;
  machineId: string;
  machineName: string;
  orderNumber: string | null;
  processName: string | null;
};

export type AvailabilityRow = {
  employeeId: string;
  name: string;
  employeeCode: string;
  clockedIn: boolean;
  presence: Presence;
  allocations: AllocationEntry[];
};

export type WorkerBoardScreenProps = {
  shifts: Shift[];
  currentShiftId: string | null;
  /** The factory date this board shows, `YYYY-MM-DD`. */
  dateKey: string;
  minDate: string;
  maxDate: string;
  machines: StaffedMachine[];
  availability: AvailabilityRow[];
  canWrite: boolean;
  /** ADMIN / OWNER: may assign over a blocked conflict, with a reason. The server decides; this only shows the field. */
  canOverride: boolean;
  /** Opens that booking's Assign slide-over (`?allocation=`). */
  openAllocationId: string | null;
};

const PRESENCE_ORDER: Record<Presence, number> = { IN: 0, NOT_IN: 1, OUT: 2, ABSENT: 3, LEAVE: 4 };

/** The picker lists people who are on the floor first, then the rest, each group by name (R3 B90). */
export function sortPickerRows<T extends { name: string; presence: Presence }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => PRESENCE_ORDER[a.presence] - PRESENCE_ORDER[b.presence] || a.name.localeCompare(b.name));
}

/** "Assigned 3 · skipped 1 (Ramesh)" — the toast after an assign (R3 B90). */
export function assignSummary(created: number, skippedNames: string[]): string {
  return skippedNames.length === 0
    ? `Assigned ${created}`
    : `Assigned ${created} · skipped ${skippedNames.length} (${skippedNames.join(', ')})`;
}

const PRESENCE_STYLE: Record<Presence, string> = {
  IN: 'bg-green-100 text-green-800',
  OUT: 'bg-slate-200 text-slate-700',
  LEAVE: 'bg-sky-100 text-sky-800',
  ABSENT: 'bg-red-100 text-red-800',
  NOT_IN: 'bg-amber-100 text-amber-900',
};

function PresenceChip({ presence }: { presence: Presence }) {
  const t = useT();
  const label =
    presence === 'IN' ? t('crew.clockedIn') : presence === 'NOT_IN' ? t('crew.notClockedIn') : presence === 'OUT' ? 'Clocked out' : presence === 'LEAVE' ? 'On leave' : 'Absent';
  return (
    <span data-testid="presence-chip" data-presence={presence} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRESENCE_STYLE[presence]}`}>
      {label}
    </span>
  );
}

/**
 * The crew board — worker availability plus one-action crew assignment
 * (MIS-263). A phone-width work screen, not a home screen.
 *
 * R3: shows one date and shift, lists every machine a person is on, and every action returns a
 * result that is shown here (a toast for the outcome, an inline message for a refusal).
 */
export function WorkerBoardScreen({
  shifts,
  currentShiftId,
  dateKey,
  minDate,
  maxDate,
  machines,
  availability,
  canWrite,
  canOverride,
  openAllocationId,
}: WorkerBoardScreenProps) {
  const t = useT();
  const { toast } = useToast();
  const { confirm, confirmDialog } = useConfirm();
  const [openMachine, setOpenMachine] = useState<StaffedMachine | null>(
    () => machines.find((m) => m.machineAllocationId === openAllocationId) ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const [boardError, setBoardError] = useState<string | null>(null);

  const freeWorkers = availability.filter((w) => w.allocations.length === 0);

  const copyYesterday = () => {
    if (!currentShiftId) return;
    startTransition(async () => {
      setBoardError(null);
      const result = await copyCrewAction({ fromDateKey: addDaysToDateKey(dateKey, -1), toDateKey: dateKey, shiftId: currentShiftId });
      if (!result.ok) {
        setBoardError(result.detail);
        return;
      }
      toast(result.value.skipped.length > 0 ? 'info' : 'success', assignSummary(result.value.copied, result.value.skipped.map((s) => s.name)));
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{t('crew.title')}</h1>
        {shifts.length > 1 && (
          <div className="flex flex-wrap gap-1 rounded-full border border-slate-200 bg-white p-1">
            {shifts.map((s) => (
              <Link
                key={s.id}
                href={`/mis/crew?date=${dateKey}&shift=${s.id}`}
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

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" action="/mis/crew" className="flex items-end gap-2">
          {currentShiftId && <input type="hidden" name="shift" value={currentShiftId} />}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Date
            <input
              type="date"
              name="date"
              defaultValue={dateKey}
              min={minDate}
              max={maxDate}
              className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900"
            />
          </label>
          <Button type="submit" variant="secondary">
            Go
          </Button>
        </form>
        {canWrite && currentShiftId && (
          <Button variant="ghost" disabled={isPending} onClick={copyYesterday}>
            Copy yesterday’s crew
          </Button>
        )}
        <Link href={`/mis/crew/report?date=${dateKey}`} className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">
          Manpower report →
        </Link>
      </div>

      {boardError && <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{boardError}</div>}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('crew.staffedMachines')}</h2>
        {machines.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">{t('crew.noMachinesStaffed')}</div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {machines.map((m) => {
              const crew = availability.filter((w) => w.allocations.some((a) => a.machineAllocationId === m.machineAllocationId));
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
          <div className="rounded-xl border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">{t('crew.noWorkers')}</div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {availability.map((w) => (
              <WorkerRow key={w.employeeId} worker={w} canWrite={canWrite} machines={machines} confirm={confirm} />
            ))}
          </div>
        )}
      </section>

      {openMachine && (
        <AssignCrewSlideOver
          machine={openMachine}
          availability={availability}
          shiftId={currentShiftId}
          dateKey={dateKey}
          canOverride={canOverride}
          onClose={() => setOpenMachine(null)}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function WorkerRow({
  worker,
  canWrite,
  machines,
  confirm,
}: {
  worker: AvailabilityRow;
  canWrite: boolean;
  machines: StaffedMachine[];
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const t = useT();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const release = async (entry: AllocationEntry) => {
    const ok = await confirm({
      title: t('crew.release'),
      message: `${worker.name} — ${entry.machineName}`,
      confirmLabel: t('crew.release'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      setError(null);
      const result = await releaseWorkerAction(entry.id);
      if (!result.ok) setError(result.detail);
      else toast('success', `${worker.name}: ${t('crew.released')}`);
    });
  };

  const move = (entry: AllocationEntry, toMachineAllocationId: string) => {
    if (!toMachineAllocationId) return;
    startTransition(async () => {
      setError(null);
      const result = await moveWorkerAction({ workerAllocationId: entry.id, toMachineAllocationId });
      if (!result.ok) setError(result.detail);
      else toast('success', `${worker.name} moved`);
    });
  };

  return (
    <div className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900">
        <span className="truncate">{worker.name}</span>
        <span className="font-mono text-xs text-gray-400">{worker.employeeCode}</span>
        <PresenceChip presence={worker.presence} />
      </div>
      {worker.allocations.length === 0 ? (
        <div className="text-xs text-gray-500">{t('crew.free')}</div>
      ) : (
        <ul className="mt-1 space-y-1">
          {worker.allocations.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
              <span className="truncate">
                {t('crew.assignedTo')} {a.machineName}
                {a.orderNumber ? ` · ${a.orderNumber}` : ''}
              </span>
              {canWrite && (
                <span className="flex items-center gap-2">
                  {machines.filter((m) => m.machineAllocationId !== a.machineAllocationId).length > 0 && (
                    <select
                      aria-label={`Move ${worker.name} from ${a.machineName}`}
                      value=""
                      disabled={isPending}
                      onChange={(e) => move(a, e.target.value)}
                      className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
                    >
                      <option value="">Move to…</option>
                      {machines
                        .filter((m) => m.machineAllocationId !== a.machineAllocationId)
                        .map((m) => (
                          <option key={m.machineAllocationId} value={m.machineAllocationId}>
                            {m.machineName}
                          </option>
                        ))}
                    </select>
                  )}
                  <Button variant="ghost" disabled={isPending} onClick={() => release(a)}>
                    {t('crew.release')}
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

type Outcome = Pick<AssignWorkersActionResult, 'blocked' | 'warnings'>;

function AssignCrewSlideOver({
  machine,
  availability,
  shiftId,
  dateKey,
  canOverride,
  onClose,
}: {
  machine: StaffedMachine;
  availability: AvailabilityRow[];
  shiftId: string | null;
  dateKey: string;
  canOverride: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>({ blocked: [], warnings: [] });
  const [overrideReason, setOverrideReason] = useState('');
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

  const sorted = useMemo(() => sortPickerRows(availability), [availability]);
  const alreadyHereIds = useMemo(
    () => new Set(availability.filter((w) => w.allocations.some((a) => a.machineAllocationId === machine.machineAllocationId)).map((w) => w.employeeId)),
    [availability, machine.machineAllocationId],
  );

  const submit = (employeeIds: string[], extra: { confirmWarnings?: boolean; override?: { reason: string } } = {}) => {
    if (!shiftId || employeeIds.length === 0) return;
    startTransition(async () => {
      setError(null);
      const result = await assignWorkersAction({
        machineAllocationId: machine.machineAllocationId,
        employeeIds,
        shiftId,
        allocationDate: dateKey,
        ...extra,
      });
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      const v = result.value;
      const names = [...new Set([...v.blocked, ...v.warnings].map((c) => c.employeeName))];
      toast(names.length > 0 ? 'info' : 'success', assignSummary(v.createdCount, names));
      if (v.blocked.length === 0 && v.warnings.length === 0) {
        onClose();
        return;
      }
      setOutcome({ blocked: v.blocked, warnings: v.warnings });
      setSelected(new Set([...v.blocked, ...v.warnings].map((c) => c.employeeId)));
    });
  };

  const moveHere = (conflictingAllocationId: string | null) => {
    if (!conflictingAllocationId) return;
    startTransition(async () => {
      setError(null);
      const result = await moveWorkerAction({ workerAllocationId: conflictingAllocationId, toMachineAllocationId: machine.machineAllocationId });
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      toast('success', 'Moved');
      onClose();
    });
  };

  const blockedIds = [...new Set(outcome.blocked.map((c) => c.employeeId))];
  const warningIds = [...new Set(outcome.warnings.map((c) => c.employeeId))];

  return (
    <SlideOver open onClose={onClose} title={`${t('crew.assignCrew')} — ${machine.machineName}`}>
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{machine.orderNumber ?? machine.jobRef ?? '—'}</div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{t('crew.selectWorkers')}</p>
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {sorted.map((w) => {
              const hereAlready = alreadyHereIds.has(w.employeeId);
              return (
                <label key={w.employeeId} className={`flex items-center gap-3 px-3 py-2.5 text-sm ${hereAlready ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(w.employeeId) || hereAlready}
                    disabled={hereAlready}
                    onChange={() => toggle(w.employeeId)}
                    className="h-5 w-5 rounded border-gray-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium text-gray-900">
                      {w.name}
                      <PresenceChip presence={w.presence} />
                    </span>
                    <span className="block text-xs text-gray-500">
                      {hereAlready
                        ? `${t('crew.assignedTo')} ${machine.machineName}`
                        : w.allocations.length > 0
                          ? `${t('crew.assignedTo')} ${w.allocations.map((a) => a.machineName).join(', ')}`
                          : t('crew.free')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {outcome.blocked.length > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {outcome.blocked.map((c) => (
              <div key={`${c.employeeId}-${c.kind}`} className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p>
                  <strong>{c.employeeName}</strong>{' '}
                  {c.kind === 'ON_LEAVE'
                    ? 'is on approved leave that day.'
                    : `${t('crew.overlapWarning')} ${c.conflictingMachineName ?? ''}${c.conflictingOrderNumber ? ` (${c.conflictingOrderNumber})` : ''}${c.conflictingProcessName ? ` ${t('crew.overlapWarningFor')} ${c.conflictingProcessName}` : ''}.`}
                </p>
                {c.kind === 'OVERLAP' && (
                  <Button variant="secondary" disabled={isPending} onClick={() => moveHere(c.conflictingAllocationId)}>
                    Move here
                  </Button>
                )}
              </div>
            ))}
            {canOverride && (
              <div className="mt-2 flex flex-col gap-2">
                <label className="text-sm font-medium text-red-900">
                  Reason to assign anyway
                  <input
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="mt-1 min-h-12 w-full rounded-lg border border-red-300 bg-white px-3 text-base text-slate-900"
                  />
                </label>
                <Button
                  variant="danger"
                  disabled={isPending || overrideReason.trim().length < 3}
                  onClick={() => submit(blockedIds, { override: { reason: overrideReason.trim() } })}
                >
                  {t('crew.confirmAnyway')}
                </Button>
              </div>
            )}
          </div>
        )}

        {outcome.warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {outcome.warnings.map((c) => (
              <p key={`${c.employeeId}-${c.kind}`} className="mb-1">
                <strong>{c.employeeName}</strong> {t('crew.notClockedIn').toLowerCase()}.
              </p>
            ))}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => submit(warningIds, { confirmWarnings: true })}
                disabled={isPending}
                className="min-h-11 rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900"
              >
                {t('crew.confirmAnyway')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const id of warningIds) next.delete(id);
                    return next;
                  });
                  setOutcome((o) => ({ ...o, warnings: [] }));
                }}
                className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                {t('crew.skip')}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button onClick={() => submit([...selected])} disabled={isPending || selected.size === 0 || !shiftId}>
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
