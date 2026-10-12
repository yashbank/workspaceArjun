'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import Link from 'next/link';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input } from '@/components/mis/kit/input';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/mis/action-result';
import { approveBomAction, rejectBomAction, approveLeaveAction, approvePOAction, approveExtraPayDayAction, rejectExtraPayDayAction } from '@/app/(mis)/mis/approvals/actions';
import { poPurpose, poPurposeLabel } from '@/lib/mis/po-purpose';

type ExtraPayDay = {
  id: string; date: Date; kind: 'MULTIPLIER' | 'FLAT_AMOUNT'; value: number;
  scope: 'ALL_PRESENT' | 'EMPLOYEES' | 'DEPARTMENTS'; reason: string;
};

type Pending = {
  boms: { id: string; order: { id: string; orderNumber: string; description: string | null } | null }[];
  leaves: { id: string; date: Date; reason: string | null; employee: { name: string; employeeCode: string } | null }[];
  pos: { id: string; poNumber: string; bomRef: string | null; supplier: { name: string } | null }[];
  // Non-empty ONLY when the caller holds wages.read (server gate, approvals.ts) — every other
  // role sharing this queue (Admin, Supervisor, QC all hold orders.read) gets an empty array,
  // never a redacted one (D24).
  extraPayDays: ExtraPayDay[];
  total: number;
};

type Props = { pending: Pending; isOwner: boolean; canWrite: boolean };

export function ApprovalsScreen({ pending, isOwner, canWrite: _canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  // A refusal (e.g. "this PO has no line items") comes back as a value; show it instead of dropping it.
  const settle = (result: ActionResult<unknown>) => { if (!result.ok) toast('error', result.detail); return result.ok; };
  const [rejecting, setRejecting] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [reason, setReason] = useState('');

  const rejectBom = () => {
    if (!rejecting) return;
    startTransition(async () => {
      if (settle(await rejectBomAction(rejecting.orderId, reason))) { setRejecting(null); setReason(''); }
    });
  };
  const approveBom = (id: string) => startTransition(async () => { settle(await approveBomAction(id)); });
  const approveLeave = (id: string, approve: boolean) => startTransition(async () => { await approveLeaveAction(id, approve); });
  const approvePO = (id: string) => startTransition(async () => { settle(await approvePOAction(id)); });
  const approveExtraPay = (id: string) => startTransition(async () => { await approveExtraPayDayAction(id); });
  const rejectExtraPay = (id: string) => startTransition(async () => { await rejectExtraPayDayAction(id); });

  if (pending.total === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">Approval Queue</h1>
        <div className="text-center py-16">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-lg font-medium text-slate-700">All caught up!</p>
          <p className="text-slate-500 text-sm mt-1">No pending approvals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Approval Queue</h1>
        <span className="bg-red-100 text-red-700 text-sm font-bold rounded-full px-2.5 py-0.5">{pending.total}</span>
      </div>

      {/* BOM Approvals */}
      {isOwner && pending.boms.length > 0 && (
        <QueueSection title="Bill of Materials" count={pending.boms.length}>
          {pending.boms.map(bom => (
            <QueueRow
              key={bom.id}
              title={bom.order?.orderNumber ?? '—'}
              subtitle={bom.order?.description ?? 'No description'}
              badge={<StatusBadge tone="warning">Pending Approval</StatusBadge>}
              actions={
                <>
                  <Button onClick={() => approveBom(bom.id)} disabled={isPending}>Approve</Button>
                  {bom.order && <Button variant="ghost" onClick={() => { setReason(''); setRejecting({ orderId: bom.order!.id, orderNumber: bom.order!.orderNumber }); }} disabled={isPending}>Reject</Button>}
                  <Link href={`/mis/bom/${bom.order?.id ?? ''}`} className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">View BOM</Link>
                </>
              }
            />
          ))}
        </QueueSection>
      )}

      {/* Leave Approvals */}
      {pending.leaves.length > 0 && (
        <QueueSection title="Leave Requests" count={pending.leaves.length}>
          {pending.leaves.map(leave => (
            <QueueRow
              key={leave.id}
              title={leave.employee?.name ?? '—'}
              subtitle={`${leave.employee?.employeeCode ?? ''} · ${new Date(leave.date).toLocaleDateString('en-IN')}${leave.reason ? ` — ${leave.reason}` : ''}`}
              badge={<StatusBadge tone="warning">Pending</StatusBadge>}
              actions={
                <>
                  <Button onClick={() => approveLeave(leave.id, true)} disabled={isPending}>Approve</Button>
                  <Button variant="ghost" onClick={() => approveLeave(leave.id, false)} disabled={isPending}>Reject</Button>
                </>
              }
            />
          ))}
        </QueueSection>
      )}

      {/* PO Approvals */}
      {isOwner && pending.pos.length > 0 && (
        <QueueSection title="Purchase Orders" count={pending.pos.length}>
          {pending.pos.map(po => (
            <QueueRow
              key={po.id}
              title={po.poNumber}
              subtitle={[po.supplier?.name ?? 'No supplier', poPurposeLabel(poPurpose(po))].join(' · ')}
              badge={<StatusBadge tone="warning">Pending Approval</StatusBadge>}
              actions={
                <>
                  <Button onClick={() => approvePO(po.id)} disabled={isPending}>Approve</Button>
                  <Link href="/mis/po" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">View PO</Link>
                </>
              }
            />
          ))}
        </QueueSection>
      )}

      {/* Extra-pay days (25.4, D28) — the array is only ever non-empty for the Owner already. */}
      <SlideOver open={rejecting !== null} onClose={() => setRejecting(null)} title={`Reject BOM${rejecting ? ` · ${rejecting.orderNumber}` : ''}`}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">The BOM goes back to draft so it can be fixed and submitted again. Say what needs changing.</p>
          <Input label="Reason" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button variant="danger" onClick={rejectBom} disabled={isPending || reason.trim().length < 3}>Reject BOM</Button>
            <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {isOwner && pending.extraPayDays.length > 0 && (
        <QueueSection title="Extra-pay days" count={pending.extraPayDays.length}>
          {pending.extraPayDays.map((day) => (
            <QueueRow
              key={day.id}
              title={`${new Date(day.date).toLocaleDateString('en-IN')} · ${day.kind === 'FLAT_AMOUNT' ? `₹${day.value}` : `×${day.value}`}`}
              subtitle={`${day.scope === 'ALL_PRESENT' ? 'Everyone present' : day.scope === 'EMPLOYEES' ? 'Specific employees' : 'Specific departments'} — ${day.reason}`}
              badge={<StatusBadge tone="warning">Pending</StatusBadge>}
              actions={
                <>
                  <Button onClick={() => approveExtraPay(day.id)} disabled={isPending}>Approve</Button>
                  <Button variant="ghost" onClick={() => rejectExtraPay(day.id)} disabled={isPending}>Reject</Button>
                </>
              }
            />
          ))}
        </QueueSection>
      )}
    </div>
  );
}

function QueueSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-semibold text-slate-700">{title}</h2>
        <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{count}</span>
      </div>
      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
        {children}
      </div>
    </div>
  );
}

function QueueRow({ title, subtitle, badge, actions }: { title: string; subtitle: string; badge: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-4 gap-4 flex-wrap">
      <div>
        <p className="font-medium text-slate-900">{title}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        {badge}
        {actions}
      </div>
    </div>
  );
}
