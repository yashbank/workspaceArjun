'use client';

import { PageBack } from '@/components/mis/common/page-back';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { NumberInput, Input, DateInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { clearLineAction, editProductionLogAction } from '@/app/(mis)/mis/production/actions';
import { voidProductionLogAction } from '@/app/(mis)/mis/production/correction-actions';
import { useT } from '@/components/mis/shell/locale-provider';
import { PendingSyncNote } from '@/components/mis/shell/pending-sync-note';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey, type ParkReason } from '@/lib/mis/offline/idempotency';
import { isClearanceBlock, submitProduction } from './submit-production';
import { fmtDate, fmtTime } from '@/lib/mis/client-dates';
import {
  canEditLogNow,
  crewFirst,
  DEFAULT_PRODUCTION_UNIT,
  isClosedOrderStatus,
  machineMismatchNote,
  makereadyError,
  preselectMachine,
  validateQuantities,
  type SelectChoice,
} from '@/lib/mis/production-form';
import { formatQty } from '@/lib/mis/qty-by-unit';
import type { ProductionWarning } from '@/server/mis/production';

type Log = {
  id: string;
  /** The log's phase is SIGNED_OFF, so it can no longer be edited (R3 B126). */
  phaseSigned?: boolean;
  machineId?: string | null;
  employeeId?: string | null;
  loggedAt: Date | string;
  qtyProduced: number | string;
  qtyWaste: number | string;
  unit: string;
  notes: string | null;
  machine: { name: string } | null;
  employee: { name: string } | null;
  shift: { name: string } | null;
  /** BOM stage the entry belongs to (R2-18). */
  stageName?: string | null;
  /** R2-48 — set-up minutes before the run. */
  makereadyMinutes?: number | null;
  /** R2-17 — computed on the server with the rule it enforces; absent falls back to the 24 h check. */
  canEdit?: boolean;
  canDelete?: boolean;
};


type UnitTotal = { unit: string; produced: number; waste: number; wastePercent: number | null };
type Summary = { totalProduced: number; totalWaste: number; entries: number; byUnit?: UnitTotal[] };
type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };
type Person = { id: string; name: string };

interface Props {
  order: Order;
  logs: Log[];
  summary: Summary;
  /** Production-floor people only, already labelled "Name (CODE · Role)" (#19). */
  operators: SelectChoice[];
  machines: Person[];
  /** UNIT master group (#16). */
  units: SelectChoice[];
  /** Stages of this order's BOM (#18); empty when it has none. */
  stages: SelectChoice[];
  /** Machine(s) currently allocated to this order (#39/#43). */
  allocatedMachines: Person[];
  canWrite: boolean;
  userId: string;
  /** machineId -> employee ids booked on it now (R3 B122); the picker lists them first. */
  crewByMachine?: Record<string, string[]>;
  /** The factory's today as YYYY-MM-DD, from the server (R3 B120). */
  factoryToday?: string;
  /** Server time at render, for the 24 h edit window (R3 B126). */
  nowIso?: string;
}


function fmt(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return fmtDate(d, { day: '2-digit', month: 'short' }) + ' ' + fmtTime(d, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function ProductionDetailScreen({ order, logs, summary, operators, machines, units, stages, allocatedMachines, canWrite, userId, crewByMachine = {}, factoryToday = '', nowIso }: Props) {
  const todayIso = () => factoryToday;
  const t = useT();
  const { toast } = useToast();
  // One key per form, made when the form starts — see production-screen.tsx.
  const keyRef = useRef(newIdempotencyKey());
  const [blockedReason, setBlockedReason] = useState<ParkReason | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [waste, setWaste] = useState('');
  const [unitInput, setUnitInput] = useState(DEFAULT_PRODUCTION_UNIT);
  const [logDate, setLogDate] = useState(todayIso());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const allocatedDefault = preselectMachine(allocatedMachines.map((m) => m.id));
  const [machineId, setMachineId] = useState<string | null>(allocatedDefault);
  const [stageId, setStageId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [makeready, setMakeready] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Log | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editWaste, setEditWaste] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editMakeready, setEditMakeready] = useState('');
  const [editReason, setEditReason] = useState('');
  const [deleting, setDeleting] = useState<Log | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isEditing, startEditing] = useTransition();

  const closed = isClosedOrderStatus(order.status);
  const now = nowIso ? new Date(nowIso) : new Date(0);
  const unitTotals: UnitTotal[] =
    summary.byUnit && summary.byUnit.length > 0
      ? summary.byUnit
      : [{ unit: logs[0]?.unit ?? DEFAULT_PRODUCTION_UNIT, produced: Number(summary.totalProduced), waste: Number(summary.totalWaste), wastePercent: null }];
  const operatorChoices = crewFirst(operators, machineId ? (crewByMachine[machineId] ?? []) : []);

  const machineNote = machineMismatchNote(machineId, allocatedMachines);

  const machineOptions = machines.map((m) => ({ value: m.id, label: m.name }));

  const resetForm = () => {
    setQty(''); setWaste(''); setUnitInput(DEFAULT_PRODUCTION_UNIT); setLogDate(todayIso());
    setEmployeeId(null); setMachineId(allocatedDefault); setStageId(null); setNotes(''); setMakeready(''); setError(null); setBlockedReason(undefined);
    keyRef.current = newIdempotencyKey();
  };

  const handleLog = () => startTransition(async () => {
    if (!machineId) { setError('Select a machine before logging production.'); return; }
    const invalid = validateQuantities(qty, waste) ?? makereadyError(makeready);
    if (invalid) { setError(invalid); return; }
    setError(null);
    setBlockedReason(undefined);
    const outcome = await submitProduction({
      key: keyRef.current,
      userId,
      payload: {
        orderId: order.id,
        machineId,
        qtyProduced: parseFloat(qty),
        qtyWaste: waste ? parseFloat(waste) : 0,
        unit: unitInput || undefined,
        bomStageId: stageId ?? undefined,
        employeeId: employeeId ?? undefined,
        notes: notes || undefined,
        makereadyMinutes: makeready.trim() === '' ? undefined : Number(makeready),
        // Only a deliberate back-date is sent. Left at today, the entry takes the
        // moment of the tap (D15), which is more truthful than midnight.
        producedOn: logDate && logDate !== todayIso() ? logDate : undefined,
      },
      label: order.orderNumber,
    });

    switch (outcome.kind) {
      case 'APPLIED':
        setNotice(outcome.warnings && outcome.warnings.length > 0 ? outcome.warnings.map((w: ProductionWarning) => w.message).join(' ') : null);
        resetForm();
        setOpen(false);
        break;
      case 'QUEUED':
        toast('info', t('sync.savedOnDevice'));
        resetForm();
        setOpen(false);
        break;
      case 'BLOCKED':
        setError(outcome.detail);
        setBlockedReason(outcome.reason);
        break;
      case 'NOT_SAVED':
        setError(outcome.detail);
        break;
    }
  });

  const handleClearLine = () => startClearing(async () => {
    if (!machineId) return;
    const result = await clearLineAction({ machineId, orderId: order.id });
    if (result.ok) {
      setError(null);
      setBlockedReason(undefined);
    } else {
      setError(result.detail);
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <PageBack href="/mis/production" label="Production" />

      {/* Header */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <StatusBadge>{order.status}</StatusBadge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{order.customer?.name ?? 'No customer'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/mis/orders/${order.id}`}>
            <Button variant="ghost">Order Details</Button>
          </Link>
          <Link href={`/mis/print/job-card/${order.id}`} target="_blank">
            <Button variant="ghost">Print Job Card</Button>
          </Link>
          {canWrite && !closed && <Button onClick={() => setOpen(true)}>+ Log Production</Button>}
          {canWrite && closed && <span className="self-center text-sm text-gray-500">Order is {order.status.toLowerCase().replace(/_/g, ' ')}</span>}
        </div>
      </div>

      <PendingSyncNote />

      {notice && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}
        </p>
      )}

      {/* Progress & Stats - per unit, never one mixed sum (R3 B124) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Produced</div>
          {unitTotals.map((u) => (
            <div key={u.unit} className="text-2xl font-bold text-gray-900">{formatQty(u.produced)} <span className="text-sm font-normal text-gray-500">{u.unit}</span></div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Waste</div>
          {unitTotals.map((u) => (
            <div key={u.unit}>
              <div className="text-2xl font-bold text-orange-500">{formatQty(u.waste)} <span className="text-sm font-normal text-gray-500">{u.unit}</span></div>
              <div className="text-xs text-gray-400 mt-0.5">
                {u.produced + u.waste > 0 ? ((u.waste / (u.produced + u.waste)) * 100).toFixed(1) : 0}% waste rate
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Log Entries</div>
          <div className="text-2xl font-bold text-gray-900">{summary.entries}</div>
        </div>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-700">Production Log</div>
        {logs.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No production logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-5 py-3 text-left font-medium">Date/Time</th>
                <th className="px-5 py-3 text-right font-medium">Produced</th>
                <th className="px-5 py-3 text-right font-medium">Waste</th>
                <th className="px-5 py-3 text-left font-medium">Stage</th>
                <th className="px-5 py-3 text-left font-medium">Machine</th>
                <th className="px-5 py-3 text-left font-medium">Operator</th>
                <th className="px-5 py-3 text-right font-medium">Makeready</th>
                <th className="px-5 py-3 text-left font-medium">Notes</th>
                {canWrite && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{fmt(log.loggedAt)}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{Number(log.qtyProduced).toFixed(1)} {log.unit}</td>
                  <td className="px-5 py-3 text-right text-orange-600">{Number(log.qtyWaste).toFixed(1)}</td>
                  <td className="px-5 py-3 text-gray-500">{log.stageName ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{log.machine?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{log.employee?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{log.makereadyMinutes != null ? `${log.makereadyMinutes} min` : '—'}</td>
                  <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{log.notes ?? '—'}</td>
                  {canWrite && (
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {(log.canEdit ?? canEditLogNow(log, order.status, now)) && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditing(log);
                            setEditQty(String(Number(log.qtyProduced)));
                            setEditWaste(String(Number(log.qtyWaste)));
                            setEditNotes(log.notes ?? '');
                            setEditMakeready(log.makereadyMinutes != null ? String(log.makereadyMinutes) : '');
                            setEditReason('');
                            setError(null);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                      {log.canDelete && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setDeleting(log);
                            setDeleteReason('');
                            setError(null);
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Log production slide-over */}
      <SlideOver open={open} onClose={() => setOpen(false)} title="Log Production">
        <div className="flex flex-col gap-4 p-4">
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Order: <span className="font-medium text-gray-800">{order.orderNumber}</span>
          </div>
          <NumberInput label="Qty Produced" value={qty} onChange={(e) => setQty(e.target.value)} />
          <NumberInput label="Qty Waste" value={waste} onChange={(e) => setWaste(e.target.value)} />
          <Select label="Unit" value={unitInput} options={units} onChange={setUnitInput} />
          <DateInput label="Date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <Select
            label="Operator"
            value={employeeId}
            options={operatorChoices}
            onChange={setEmployeeId}
            placeholder="Select an employee…"
          />
          <Select
            label="Machine"
            value={machineId}
            options={machineOptions}
            onChange={setMachineId}
            placeholder="Select a machine…"
          />
          {machineNote && <p role="status" className="-mt-2 text-xs text-amber-800">{machineNote}</p>}
          {stages.length > 0 && (
            <Select
              label="Process / BOM stage (optional)"
              value={stageId}
              options={stages}
              onChange={setStageId}
              placeholder="Select a stage…"
            />
          )}
          <NumberInput label="Makeready (minutes, optional)" value={makeready} onChange={(e) => setMakeready(e.target.value)} />
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{error}</p>
              {isClearanceBlock(blockedReason) && (
                <button
                  type="button"
                  onClick={handleClearLine}
                  disabled={isClearing || !machineId}
                  className="mt-2 w-full rounded-xl border border-amber-300 bg-white py-2.5 font-semibold text-amber-900"
                >
                  Clear the line
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleLog} disabled={isPending || !qty || !machineId}>Log</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Edit an entry (R3 B126 / R2-17: supervisor 24 h, Admin/Owner 7 days, always with a reason) */}
      <SlideOver open={editing !== null} onClose={() => setEditing(null)} title="Edit entry">
        <div className="flex flex-col gap-4 p-4">
          <NumberInput label="Qty Produced" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
          <NumberInput label="Qty Waste" value={editWaste} onChange={(e) => setEditWaste(e.target.value)} />
          <NumberInput label="Makeready (minutes)" value={editMakeready} onChange={(e) => setEditMakeready(e.target.value)} />
          <Input label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          <Input label="Reason for the change" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button
              disabled={isEditing || editReason.trim().length < 3}
              onClick={() =>
                startEditing(async () => {
                  const invalid = validateQuantities(editQty, editWaste) ?? makereadyError(editMakeready);
                  if (invalid) { setError(invalid); return; }
                  const res = await editProductionLogAction(editing!.id, {
                    qtyProduced: parseFloat(editQty),
                    qtyWaste: editWaste ? parseFloat(editWaste) : 0,
                    notes: editNotes,
                    makereadyMinutes: editMakeready.trim() === '' ? null : Number(editMakeready),
                    reason: editReason.trim(),
                  });
                  if (res.ok) { setEditing(null); setError(null); } else { setError(res.detail); }
                })
              }
            >
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Delete an entry (R2-17: Admin/Owner within 7 days, with a reason; kept in the audit trail) */}
      <SlideOver open={deleting !== null} onClose={() => setDeleting(null)} title="Delete entry">
        <div className="flex flex-col gap-4 p-4">
          {deleting && (
            <p className="text-sm text-gray-600">
              {fmt(deleting.loggedAt)} · {Number(deleting.qtyProduced).toFixed(1)} {deleting.unit}. It leaves every total; the audit log keeps it.
            </p>
          )}
          <Input label="Reason for deleting" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button
              variant="danger"
              disabled={isEditing || deleteReason.trim().length < 3}
              onClick={() =>
                startEditing(async () => {
                  const res = await voidProductionLogAction(deleting!.id, deleteReason.trim());
                  if (res.ok) { setDeleting(null); setError(null); toast('success', 'Entry deleted'); } else { setError(res.detail); }
                })
              }
            >
              Delete entry
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
