'use client';
import { useState, useTransition } from 'react';

import { createStoreReturnAction, decideStoreReturnAction } from '@/app/(mis)/mis/store/returns/actions';
import { Button } from '@/components/mis/kit/button';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { Combobox } from '@/components/ui/combobox';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { unwrap } from '@/lib/mis/action-result';

/** R2-79 — Return-to-Store: send unused / rejected material back from the floor, with a reason. */

type ReturnRow = {
  id: string; returnNumber: string; quantity: number; reason: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED'; decisionNote: string | null; createdAt: Date;
  item: { id: string; code: string; name: string; unit: string }; order: { id: string; orderNumber: string } | null;
};
const TONE: Record<ReturnRow['status'], BadgeTone> = { PENDING: 'warning', ACCEPTED: 'good', REJECTED: 'critical' };

export function ReturnsScreen({
  returns, items, orders, canDecide,
}: {
  returns: ReturnRow[];
  items: { id: string; code: string; name: string; unit: string }[];
  orders: { id: string; orderNumber: string }[];
  canDecide: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [itemId, setItemId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const submit = () => {
    setError(null); setOk(null);
    if (!itemId) { setError('Pick the item that is coming back.'); return; }
    startTransition(async () => {
      try {
        const r = unwrap(await createStoreReturnAction({ itemId, qty: Number(qty), reason, orderId }));
        setOk(canDecide ? `${r.returnNumber} booked back into the store.` : `${r.returnNumber} sent to the Store for acceptance.`);
        setQty(''); setReason(''); setItemId(null); setOrderId(null);
      } catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    });
  };
  const decide = (id: string, decision: 'ACCEPT' | 'REJECT') => {
    setError(null); setOk(null);
    startTransition(async () => {
      try { unwrap(await decideStoreReturnAction(id, decision, decision === 'REJECT' ? rejectNote : null)); setRejectNote(''); }
      catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Returns to store</h1>
        <p className="mt-0.5 text-sm text-slate-500">Unused or rejected material coming back from the floor. Stock returns to the store when the Store accepts it.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800">Return material</h2>
        <Combobox label="Item" value={itemId} onChange={setItemId} options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} placeholder="Pick an item" />
        <NumberInput label="Quantity" value={qty} min={0} onChange={(e) => setQty(e.target.value)} />
        <Combobox label="From order (optional)" value={orderId} onChange={setOrderId} options={orders.map((o) => ({ value: o.id, label: o.orderNumber }))} placeholder="Not linked to an order" />
        <Input label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        {ok && <p role="status" className="text-sm font-medium text-emerald-700">{ok}</p>}
        <Button onClick={submit} disabled={isPending}>{isPending ? 'Saving…' : canDecide ? 'Return and book into store' : 'Send return to the Store'}</Button>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-800">Recent returns</h2>
        {returns.length === 0 && <p className="text-sm text-slate-500">No returns yet.</p>}
        {returns.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-semibold text-slate-900">{r.returnNumber}</span>
              <StatusBadge tone={TONE[r.status]}>{r.status}</StatusBadge>
            </div>
            <div className="text-sm text-slate-700">{r.item.name} × <strong>{r.quantity}</strong> {r.item.unit}{r.order && <> · Order <span className="font-mono">{r.order.orderNumber}</span></>}</div>
            <div className="text-sm text-slate-500">{r.reason}{r.decisionNote ? ` · Store: ${r.decisionNote}` : ''}</div>
            {canDecide && r.status === 'PENDING' && (
              <div className="flex flex-col gap-2">
                <Input label="Note (required to reject)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                <div className="flex gap-2">
                  <Button onClick={() => decide(r.id, 'ACCEPT')} disabled={isPending}>Accept into store</Button>
                  <Button variant="secondary" onClick={() => decide(r.id, 'REJECT')} disabled={isPending}>Reject</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
