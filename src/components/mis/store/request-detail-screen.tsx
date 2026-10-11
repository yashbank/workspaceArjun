'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { approveMaterialRequestAction, rejectMaterialRequestAction } from '@/app/(mis)/mis/store/requests/actions';
import { unwrap } from '@/lib/mis/action-result';
import { Button } from '@/components/mis/kit/button';
import { Card, CardRow } from '@/components/mis/kit/card';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';

import { STATUS_TONE, type RequestListRow } from './request-list-screen';

type Line = RequestListRow['lines'][number] & { item: { id: string; code: string; name: string; unit: string; category: string } };
type Request = Omit<RequestListRow, 'lines'> & { lines: Line[]; notes: string | null; decisionNote: string | null };

/**
 * The Store's side of a Material Issue Note. Each line opens at the requested qty; the Store may
 * lower it (down to 0 = not issued) but the input and the server both refuse more than asked.
 */
export function RequestDetailScreen({ request, canDecide }: { request: Request; canDecide: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(request.lines.map((l) => [l.id, String(l.requestedQty)])),
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isOpen = request.status === 'PENDING';

  const overCap = request.lines.filter((l) => (Number(qty[l.id]) || 0) > l.requestedQty);

  const approve = () => {
    if (overCap.length > 0) return;
    setError(null);
    startTransition(async () => {
      try {
        unwrap(await approveMaterialRequestAction(
          request.id,
          request.lines.map((l) => ({ lineId: l.id, actualIssuedQty: Number(qty[l.id]) || 0 })),
          note,
        ));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not save.');
      }
    });
  };

  const reject = () => {
    if (!note.trim()) { setError('Give a reason to reject.'); return; }
    setError(null);
    startTransition(async () => {
      try { unwrap(await rejectMaterialRequestAction(request.id, note)); }
      catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-slate-900">{request.requestNumber}</h1>
          <StatusBadge tone={STATUS_TONE[request.status] ?? 'neutral'}>{request.status}</StatusBadge>
        </div>
        <Link href="/mis/store/requests" className="inline-flex min-h-11 items-center text-sm text-slate-500 hover:underline">← All requests</Link>
      </div>

      <Card>
        {request.order && <CardRow label="Order" value={<Link href={`/mis/orders/${request.order.id}`} className="font-mono text-blue-600 hover:underline">{request.order.orderNumber}</Link>} />}
        {request.department && <CardRow label="Department" value={request.department.name} />}
        {request.notes && <CardRow label="Notes" value={request.notes} />}
        {request.decisionNote && <CardRow label="Store note" value={request.decisionNote} />}
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-800">Lines</h2>
        {request.lines.map((l) => (
          <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-slate-800">{l.item.name}</div>
                <div className="text-xs text-slate-500">{l.item.code} · {l.item.category.replace('_', ' ')}</div>
              </div>
              <div className="text-right text-sm text-slate-600">
                Requested <strong>{l.requestedQty}</strong> {l.item.unit}
                {l.actualIssuedQty !== null && <div>Issued <strong>{l.actualIssuedQty}</strong></div>}
              </div>
            </div>
            {isOpen && canDecide && (
              <NumberInput
                label={`Issue qty (max ${l.requestedQty})`}
                value={qty[l.id] ?? ''}
                max={l.requestedQty}
                min={0}
                onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                error={(Number(qty[l.id]) || 0) > l.requestedQty ? `Cannot issue more than ${l.requestedQty}` : undefined}
              />
            )}
          </div>
        ))}
      </div>

      {isOpen && canDecide && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <Input label="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={approve} disabled={isPending || overCap.length > 0}>{isPending ? 'Saving…' : 'Approve & issue'}</Button>
            <Button variant="secondary" onClick={reject} disabled={isPending}>Reject</Button>
          </div>
        </div>
      )}
    </div>
  );
}
