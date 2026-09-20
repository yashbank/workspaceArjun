'use client';
import { useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import Link from 'next/link';
import { approveBomAction, approveLeaveAction, approvePOAction } from '@/app/(mis)/mis/approvals/actions';
import { poPurpose, poPurposeLabel } from '@/lib/mis/po-purpose';

type Pending = {
  boms: { id: string; order: { id: string; orderNumber: string; description: string | null } | null }[];
  leaves: { id: string; date: Date; reason: string | null; employee: { name: string; employeeCode: string } | null }[];
  pos: { id: string; poNumber: string; bomRef: string | null; supplier: { name: string } | null }[];
  total: number;
};

type Props = { pending: Pending; isOwner: boolean; canWrite: boolean };

export function ApprovalsScreen({ pending, isOwner, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();

  const approveBom = (id: string) => startTransition(async () => { await approveBomAction(id); });
  const approveLeave = (id: string, approve: boolean) => startTransition(async () => { await approveLeaveAction(id, approve); });
  const approvePO = (id: string) => startTransition(async () => { await approvePOAction(id); });

  if (pending.total === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">Approval Queue</h1>
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
        <h1 className="text-2xl font-semibold">Approval Queue</h1>
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
                  <Link href={`/mis/bom/${bom.order?.id ?? ''}`} className="text-sm text-blue-600 hover:underline">View BOM</Link>
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
                  <Link href="/mis/po" className="text-sm text-blue-600 hover:underline">View PO</Link>
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
