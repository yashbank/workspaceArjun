'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { NumberInput, Input, DateInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { clearLineAction } from '@/app/(mis)/mis/production/actions';
import { useT } from '@/components/mis/shell/locale-provider';
import { PendingSyncNote } from '@/components/mis/shell/pending-sync-note';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey, type ParkReason } from '@/lib/mis/offline/idempotency';
import { isClearanceBlock, submitProduction } from './submit-production';

type Log = {
  id: string;
  loggedAt: Date | string;
  qtyProduced: number | string;
  qtyWaste: number | string;
  unit: string;
  notes: string | null;
  machine: { name: string } | null;
  employee: { name: string } | null;
  shift: { name: string } | null;
};

type Summary = { totalProduced: number; totalWaste: number; entries: number };
type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };
type Person = { id: string; name: string };

interface Props {
  order: Order;
  logs: Log[];
  summary: Summary;
  employees: Person[];
  machines: Person[];
  canWrite: boolean;
  userId: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function ProductionDetailScreen({ order, logs, summary, employees, machines, canWrite, userId }: Props) {
  const t = useT();
  const { toast } = useToast();
  // One key per form, made when the form starts — see production-screen.tsx.
  const keyRef = useRef(newIdempotencyKey());
  const [blockedReason, setBlockedReason] = useState<ParkReason | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [waste, setWaste] = useState('');
  const [unitInput, setUnitInput] = useState('KG');
  const [logDate, setLogDate] = useState(todayIso());
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const unit = logs[0]?.unit ?? 'KG';
  const produced = summary.totalProduced;

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }));
  const machineOptions = machines.map((m) => ({ value: m.id, label: m.name }));

  const resetForm = () => {
    setQty(''); setWaste(''); setUnitInput('KG'); setLogDate(todayIso());
    setEmployeeId(null); setMachineId(null); setNotes(''); setError(null); setBlockedReason(undefined);
    keyRef.current = newIdempotencyKey();
  };

  const handleLog = () => startTransition(async () => {
    if (!machineId) { setError('Select a machine before logging production.'); return; }
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
        employeeId: employeeId ?? undefined,
        notes: notes || undefined,
        // Only a deliberate back-date is sent. Left at today, the entry takes the
        // moment of the tap (D15), which is more truthful than midnight.
        producedOn: logDate && logDate !== todayIso() ? logDate : undefined,
      },
      label: order.orderNumber,
    });

    switch (outcome.kind) {
      case 'APPLIED':
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
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/mis/production" className="inline-flex min-h-11 items-center hover:text-gray-700">Production</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{order.orderNumber}</span>
      </nav>

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
          {canWrite && <Button onClick={() => setOpen(true)}>+ Log Production</Button>}
        </div>
      </div>

      <PendingSyncNote />

      {/* Progress & Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Produced</div>
          <div className="text-2xl font-bold text-gray-900">{Number(produced).toFixed(1)} <span className="text-sm font-normal text-gray-500">{unit}</span></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Waste</div>
          <div className="text-2xl font-bold text-orange-500">{Number(summary.totalWaste).toFixed(1)} <span className="text-sm font-normal text-gray-500">{unit}</span></div>
          <div className="text-xs text-gray-400 mt-0.5">
            {produced > 0 ? ((Number(summary.totalWaste) / (produced + Number(summary.totalWaste))) * 100).toFixed(1) : 0}% waste rate
          </div>
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-5 py-3 text-left font-medium">Date/Time</th>
                <th className="px-5 py-3 text-right font-medium">Produced</th>
                <th className="px-5 py-3 text-right font-medium">Waste</th>
                <th className="px-5 py-3 text-left font-medium">Machine</th>
                <th className="px-5 py-3 text-left font-medium">Operator</th>
                <th className="px-5 py-3 text-left font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-600">{fmt(log.loggedAt)}</td>
                  <td className="px-5 py-3 text-right font-medium text-gray-900">{Number(log.qtyProduced).toFixed(1)} {log.unit}</td>
                  <td className="px-5 py-3 text-right text-orange-600">{Number(log.qtyWaste).toFixed(1)}</td>
                  <td className="px-5 py-3 text-gray-500">{log.machine?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{log.employee?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{log.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <Input label="Unit" value={unitInput} onChange={(e) => setUnitInput(e.target.value)} />
          <DateInput label="Date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <Select
            label="Operator"
            value={employeeId}
            options={employeeOptions}
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
    </div>
  );
}
