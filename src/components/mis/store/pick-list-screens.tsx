'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { handOverPickListAction, recordPicksAction, stagePickListAction } from '@/app/(mis)/mis/store/pick-lists/actions';
import { Button } from '@/components/mis/kit/button';
import { Card, CardRow } from '@/components/mis/kit/card';
import { NumberInput } from '@/components/mis/kit/input';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { unwrap } from '@/lib/mis/action-result';
import { generalUseLabel } from '@/lib/mis/general-use';
import { PICK_STATUS_LABEL, type PickStatus } from '@/lib/mis/pick-list';

/** R2-77 — Pick & Staging screens. Stock moves ONLY on handover; the screen says so wherever it matters. */

const TONE: Record<PickStatus, BadgeTone> = { PENDING: 'warning', PICKING: 'info', STAGED: 'info', HANDED_OVER: 'good' };

type PickLineRow = { id: string; requiredQty: number; pickedQty: number; item: { id: string; code: string; name: string; unit: string } };
export type PickListRow = {
  id: string;
  status: PickStatus;
  createdAt: Date;
  materialRequest: {
    id: string; requestNumber: string; isGeneral: boolean; generalReason: string | null; costCenter: string | null;
    order: { orderNumber: string } | null; department: { name: string } | null;
  };
  lines: PickLineRow[];
};

export function PickListListScreen({ lists }: { lists: PickListRow[] }) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pick lists</h1>
        <p className="mt-0.5 text-sm text-slate-500">Approved material requests waiting to be picked, staged and handed to the supervisor. Stock moves only on handover.</p>
      </div>
      {lists.length === 0 && <p className="text-sm text-slate-500">No pick lists yet. Approve a request “for picking” to create one.</p>}
      {lists.map((l) => (
        <Link key={l.id} href={`/mis/store/pick-lists/${l.id}`} className="flex min-h-11 flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-semibold text-slate-900">{l.materialRequest.requestNumber}</span>
            <StatusBadge tone={TONE[l.status]}>{PICK_STATUS_LABEL[l.status]}</StatusBadge>
          </div>
          <div className="truncate text-sm text-slate-600">{l.lines.map((x) => `${x.item.name} × ${x.requiredQty}`).join(', ')}</div>
        </Link>
      ))}
    </div>
  );
}

export function PickListDetailScreen({ list, canWrite }: { list: PickListRow; canWrite: boolean }) {
  const [isPending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  const [picked, setPicked] = useState<Record<string, string>>(Object.fromEntries(list.lines.map((l) => [l.id, String(l.pickedQty)])));
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const status = list.status;
  const over = list.lines.filter((l) => (Number(picked[l.id]) || 0) > l.requiredQty);
  const req = list.materialRequest;
  const charged = generalUseLabel(req);

  const run = (fn: () => Promise<unknown>, message: string) => {
    setError(null);
    setDone(null);
    startTransition(async () => {
      try { await fn(); setDone(message); } catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    });
  };
  const picks = () => list.lines.map((l) => ({ lineId: l.id, pickedQty: Number(picked[l.id]) || 0 }));

  const handOver = async () => {
    const ok = await confirm({
      title: 'Hand over to the supervisor?',
      message: 'This is the moment stock leaves the store: what was picked is issued now and cannot be undone here.',
      confirmLabel: 'Hand over and issue',
    });
    if (ok) run(async () => unwrap(await handOverPickListAction(list.id)), 'Handed over — stock issued.');
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {confirmDialog}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-xl font-semibold text-slate-900">{req.requestNumber}</h1>
          <StatusBadge tone={TONE[status]}>{PICK_STATUS_LABEL[status]}</StatusBadge>
        </div>
        <Link href="/mis/store/pick-lists" className="inline-flex min-h-11 items-center text-sm text-slate-500 hover:underline">← All pick lists</Link>
      </div>
      <Card>
        {req.order && <CardRow label="Order" value={<span className="font-mono">{req.order.orderNumber}</span>} />}
        {req.department && <CardRow label="Department" value={req.department.name} />}
        {charged && <CardRow label="Charged to" value={charged} />}
        <CardRow label="Request" value={<Link href={`/mis/store/requests/${req.id}`} className="text-blue-600 hover:underline">Open</Link>} />
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-800">Lines</h2>
        {list.lines.map((l) => (
          <div key={l.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-slate-800">{l.item.name}</div>
                <div className="text-xs text-slate-500">{l.item.code}</div>
              </div>
              <div className="text-right text-sm text-slate-600">Approved <strong>{l.requiredQty}</strong> {l.item.unit}</div>
            </div>
            {canWrite && (status === 'PENDING' || status === 'PICKING') ? (
              <NumberInput
                label={`Picked (max ${l.requiredQty})`}
                value={picked[l.id] ?? ''}
                min={0}
                max={l.requiredQty}
                onChange={(e) => setPicked({ ...picked, [l.id]: e.target.value })}
                error={(Number(picked[l.id]) || 0) > l.requiredQty ? `Cannot pick more than ${l.requiredQty}` : undefined}
              />
            ) : (
              <div className="text-sm text-slate-600">Picked <strong>{l.pickedQty}</strong> {l.item.unit}</div>
            )}
          </div>
        ))}
      </div>

      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {done && <p role="status" className="text-sm font-medium text-emerald-700">{done}</p>}

      {canWrite && status !== 'HANDED_OVER' && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 p-4">
          {(status === 'PENDING' || status === 'PICKING') && (
            <Button onClick={() => run(async () => unwrap(await recordPicksAction(list.id, picks())), 'Picks saved.')} disabled={isPending || over.length > 0}>
              {isPending ? 'Saving…' : 'Save picks'}
            </Button>
          )}
          {status === 'PICKING' && (
            <Button variant="secondary" onClick={() => run(async () => unwrap(await stagePickListAction(list.id)), 'Staged — ready to hand over.')} disabled={isPending}>Mark staged</Button>
          )}
          {status === 'STAGED' && <Button onClick={handOver} disabled={isPending}>Hand over to supervisor</Button>}
        </div>
      )}
      {!canWrite && <p className="text-sm text-slate-500">The Store Guy picks, stages and hands this over. You will be notified when it is yours to collect.</p>}
    </div>
  );
}
