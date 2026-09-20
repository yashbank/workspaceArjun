'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { NumberInput, Input } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { clearLineAction, getClearanceHistoryAction } from '@/app/(mis)/mis/production/actions';
import { useT } from '@/components/mis/shell/locale-provider';
import { PendingSyncNote } from '@/components/mis/shell/pending-sync-note';
import { useOnline } from '@/components/mis/shell/use-online';
import { useToast } from '@/components/ui/toast';
import { newIdempotencyKey, type ParkReason } from '@/lib/mis/offline/idempotency';
import { isClearanceBlock, submitProduction } from './submit-production';

/** Older than this and the lists are called out as old, online or not (D16). */
const STALE_AFTER_MS = 5 * 60 * 1000;

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  customer: { name: string } | null;
  _count?: { productionLogs: number };
};

type Machine = { id: string; name: string };

type ClearanceHistoryRow = {
  id: string;
  mode: string;
  clearedAt: string;
  expiresAt: string | null;
  orderNumber: string | null;
  shiftName: string | null;
};

export function ProductionScreen({
  orders,
  machines,
  canWrite,
  userId,
  loadedAt,
}: {
  orders: Order[];
  machines: Machine[];
  canWrite: boolean;
  userId: string;
  /** When the server rendered these lists. Shown when offline: stale data that says so is honest (D16). */
  loadedAt: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const online = useOnline();
  // A page served from the worker's cache after a dead-link timeout can be hours
  // old while the browser still says it is online. Age is measured after mount —
  // never during render — so server and client markup agree (D16).
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const check = () => setStale(Date.now() - new Date(loadedAt).getTime() > STALE_AFTER_MS);
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [loadedAt]);
  // One key per form, made when the form starts — not per press — so a fast
  // double-tap sends the same key twice and the server keeps a single row
  // (Appendix B §B.2). Replaced only once the entry has landed or been queued.
  const keyRef = useRef(newIdempotencyKey());
  const [blockedReason, setBlockedReason] = useState<ParkReason | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [qty, setQty] = useState('');
  const [waste, setWaste] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isClearing, startClearing] = useTransition();
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClearanceHistoryRow[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const filtered = search.trim()
    ? orders.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) || o.status.toLowerCase().includes(search.toLowerCase()))
    : orders;

  const orderOptions: SelectOption[] = [
    { value: '', label: '— Select Order —' },
    ...orders.map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer?.name ?? 'No customer'}` })),
  ];

  const machineOptions: SelectOption[] = [
    { value: '', label: '— Select Machine —' },
    ...machines.map((m) => ({ value: m.id, label: m.name })),
  ];

  const resetForm = () => {
    setQty(''); setWaste(''); setNotes(''); setError(null); setBlockedReason(undefined);
    keyRef.current = newIdempotencyKey();
  };

  const handleLog = () => startTransition(async () => {
    setError(null);
    setBlockedReason(undefined);
    const outcome = await submitProduction({
      key: keyRef.current,
      userId,
      payload: {
        orderId,
        machineId,
        qtyProduced: parseFloat(qty),
        qtyWaste: waste ? parseFloat(waste) : 0,
        notes: notes || undefined,
      },
      label: orders.find((o) => o.id === orderId)?.orderNumber,
    });

    switch (outcome.kind) {
      case 'APPLIED':
        resetForm();
        setOpen(false);
        break;
      case 'QUEUED':
        // Saved on this device. Say so plainly — "Saved on this phone, it will
        // send when signal returns", never a bare "failed" (08-Empty-error-offline).
        toast('info', t('sync.savedOnDevice'));
        resetForm();
        setOpen(false);
        break;
      case 'BLOCKED':
        // The form keeps its values and its key: nothing was recorded, so once the
        // cause is fixed the same tap lands.
        setError(outcome.detail);
        setBlockedReason(outcome.reason);
        break;
      case 'NOT_SAVED':
        setError(outcome.detail);
        break;
    }
  });

  const handleClearLine = () => startClearing(async () => {
    const result = await clearLineAction({ machineId, orderId: orderId || null });
    if (result.ok) {
      setError(null);
      setBlockedReason(undefined);
    } else {
      setError(result.detail);
    }
  });

  const toggleHistory = () => {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (machineId) {
      startTransition(async () => {
        const rows = await getClearanceHistoryAction(machineId);
        setHistory(rows);
      });
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-600',
    CONFIRMED: 'bg-blue-100 text-blue-700',
    IN_PRODUCTION: 'bg-yellow-100 text-yellow-700',
    QC_PENDING: 'bg-purple-100 text-purple-700',
    DELIVERED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Production</h1>
        {canWrite && <Button onClick={() => setOpen(true)}>+ Log Production</Button>}
      </div>

      {/* Offline, this screen is the last-loaded copy. Stale lists that say so are
          honest; stale lists that do not are a lie (D16). */}
      {(!online || stale) && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {online ? t('sync.staleLists') : t('sync.offlineLists')}{' '}
          <span className="font-mono">
            {new Date(loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </p>
      )}
      <PendingSyncNote />

      <div>
        <input
          type="search"
          placeholder="Search orders…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400 text-sm">
          No active orders. Create orders from the Orders module.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {filtered.map((order) => (
            <div key={order.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{order.orderNumber}</div>
                  <div className="text-xs text-gray-500">{order.customer?.name ?? 'No customer'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {order._count?.productionLogs !== undefined && (
                  <span className="text-xs text-gray-400">{order._count.productionLogs} entries</span>
                )}
                <Link href={`/mis/production/${order.id}`}>
                  <Button variant="ghost">View Logs →</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <SlideOver open={open} onClose={() => { setOpen(false); setError(null); setHistoryOpen(false); }} title="Log Production">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Order" value={orderId} options={orderOptions} onChange={setOrderId} />
          <Select
            label="Machine"
            value={machineId}
            options={machineOptions}
            onChange={(v) => { setMachineId(v); setError(null); setHistoryOpen(false); setHistory(null); }}
          />
          {machineId && (
            <button type="button" onClick={toggleHistory} className="self-start text-xs font-semibold text-indigo-600">
              {historyOpen ? 'Hide clearance history' : 'View clearance history'}
            </button>
          )}
          {historyOpen && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
              {history === null ? (
                'Loading…'
              ) : history.length === 0 ? (
                'No clearances recorded for this machine yet.'
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.map((h) => (
                    <li key={h.id}>
                      {h.mode} · cleared {new Date(h.clearedAt).toLocaleString()}
                      {h.expiresAt ? ` · expires ${new Date(h.expiresAt).toLocaleString()}` : ''}
                      {h.orderNumber ? ` · ${h.orderNumber}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <NumberInput label="Qty Produced (KG)" value={qty} onChange={(e) => setQty(e.target.value)} />
          <NumberInput label="Qty Waste (KG)" value={waste} onChange={(e) => setWaste(e.target.value)} />
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
            <Button onClick={handleLog} disabled={isPending || !orderId || !machineId || !qty}>Log</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
