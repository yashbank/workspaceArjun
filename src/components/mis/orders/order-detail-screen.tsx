'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { reopenOrderAction } from '@/app/(mis)/mis/orders/actions';
import { useT } from '@/components/mis/shell/locale-provider';
import { isOrderClosed } from '@/lib/mis/order-status';

type Order = { id: string; orderNumber: string; status: string; description: string | null; deliveryDate: Date | null; notes: string | null; createdAt: Date; customer: { name: string } | null };
type Bom = { id: string; status: string; stages: any[] } | null;
type ProductionLog = { id: string; loggedAt: Date; qtyProduced: number; qtyWaste: number; unit: string; machine: { name: string } | null; employee: { name: string } | null; shift: { name: string } | null };
type QcLog = { id: string; checkTime: Date; result: string; parameterName: string | null; defectType: string | null; notes: string | null; checkBy: { name: string } | null };

type Tab = 'overview' | 'bom' | 'production' | 'qc';

type JobPhase = {
  id: string;
  sequence: number;
  status: string;
  processName: string;
  inChargeName: string | null;
  downstreamFlagged: boolean;
};

type Props = {
  order: Order;
  /**
   * Empty means this order has no phase plan, which is a state the screen
   * renders rather than a blank (D10). A silent bypass reads as a passed gate.
   */
  phases: JobPhase[];
  bom: Bom;
  productionLogs: ProductionLog[];
  productionSummary: { totalProduced: number; totalWaste: number; entries: number };
  qcLogs: QcLog[];
  qcSummary: { total: number; pass: number; fail: number };
  canWrite: boolean;
  canSeeWages: boolean;
  canProduction: boolean;
  canQc: boolean;
};

/** REOPENED reads as a warning, not as signed — it is not a signature (Appendix A §A.2). */
function phaseTone(s: string): BadgeTone {
  switch (s) {
    case 'SIGNED_OFF': return 'good';
    case 'IN_PROGRESS': return 'info';
    case 'REOPENED': return 'warning';
    case 'NOT_APPLICABLE': return 'neutral';
    default: return 'neutral';
  }
}

function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function OrderDetailScreen({
  order, phases, bom, productionLogs, productionSummary, qcLogs, qcSummary,
  canWrite, canSeeWages, canProduction, canQc,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const t = useT();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopening, startReopen] = useTransition();
  const closed = isOrderClosed(order.status);

  const handleReopen = () => startReopen(async () => {
    setReopenError(null);
    const result = await reopenOrderAction(order.id, reopenReason);
    if (result.ok) {
      setReopenOpen(false);
      setReopenReason('');
    } else {
      setReopenError(result.detail);
    }
  });

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'bom', label: 'BOM', show: true },
    { key: 'production', label: 'Production', show: canProduction },
    { key: 'qc', label: 'Quality', show: canQc },
  ];

  const prodCols: Column<ProductionLog>[] = [
    { key: 'loggedAt', header: 'Date', render: r => new Date(r.loggedAt).toLocaleDateString('en-IN') },
    { key: 'employee', header: 'Employee', render: r => r.employee?.name ?? '—' },
    { key: 'machine', header: 'Machine', render: r => r.machine?.name ?? '—' },
    { key: 'shift', header: 'Shift', render: r => r.shift?.name ?? '—' },
    { key: 'produced', header: 'Produced', render: r => `${Number(r.qtyProduced).toLocaleString('en-IN')} ${r.unit}` },
    { key: 'waste', header: 'Waste', render: r => `${Number(r.qtyWaste).toLocaleString('en-IN')} ${r.unit}` },
  ];

  const qcCols: Column<QcLog>[] = [
    { key: 'checkTime', header: 'Date', render: r => new Date(r.checkTime).toLocaleDateString('en-IN') },
    { key: 'parameter', header: 'Parameter', render: r => r.parameterName ?? 'General' },
    { key: 'result', header: 'Result', render: r => (
      <StatusBadge tone={r.result === 'PASS' ? 'good' : r.result === 'FAIL' ? 'critical' : 'neutral'}>{r.result}</StatusBadge>
    )},
    { key: 'defect', header: 'Defect / Note', render: r => r.defectType ?? r.notes ?? '—' },
    { key: 'checkedBy', header: 'Checked By', render: r => r.checkBy?.name ?? '—' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-sm text-slate-500 mb-4">
        <Link href="/mis/orders" className="hover:underline">Orders</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-800">{order.orderNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold font-mono">{order.orderNumber}</h1>
            <StatusBadge tone={statusTone(order.status)}>{order.status.replace(/_/g, ' ')}</StatusBadge>
          </div>
          {order.description && <p className="text-slate-600 mt-1">{order.description}</p>}
          {/* D14: a closed order refuses production. Say so here, beside the way
              through it — a refusal with no route is a dead end, and a dead end is
              what sends somebody to edit the database by hand. */}
          {closed && <p className="mt-1 text-sm text-amber-800">{t('order.reopen.closedNote')}</p>}
        </div>
        <div className="flex gap-2">
          {closed && canWrite && (
            <button
              type="button"
              onClick={() => setReopenOpen(true)}
              className="px-3 py-1.5 text-sm font-semibold bg-white border border-amber-300 text-amber-900 rounded hover:bg-amber-50"
            >
              {t('order.reopen')}
            </button>
          )}
          <Link href={`/mis/print/job-card/${order.id}`} target="_blank" className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded hover:bg-slate-50">
            Print Job Card
          </Link>
          {qcSummary.pass > 0 && (
            <Link href={`/mis/print/coa/${order.id}`} target="_blank" className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded hover:bg-slate-50">
              Print COA
            </Link>
          )}
        </div>
      </div>

      {/* Phases — the handover gate, or an honest statement that there is none (D10) */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Phases</p>
        {phases.length === 0 ? (
          <>
            <p className="mt-1 font-semibold text-slate-900">No phase plan · not gated</p>
            <p className="mt-0.5 text-sm text-slate-500">
              This order has no phase plan, so nothing is blocking production on it.
            </p>
          </>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {phases.map((phase) => (
              <li key={phase.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    <span className="font-mono text-xs text-slate-400">{phase.sequence}.</span>{' '}
                    {phase.processName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {phase.inChargeName ?? 'No in-charge yet'}
                    {phase.downstreamFlagged && ' · an earlier phase was reopened after this one started'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <StatusBadge tone={phaseTone(phase.status)}>
                    {phase.status.replace(/_/g, ' ')}
                  </StatusBadge>
                  {(phase.status === 'IN_PROGRESS' || phase.status === 'REOPENED') && (
                    <Link
                      href={`/mis/production/sign-off/${phase.id}`}
                      className="text-xs font-semibold text-indigo-600"
                    >
                      Sign off
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500">Customer</p>
          <p className="font-medium mt-0.5">{order.customer?.name ?? '—'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500">Delivery Date</p>
          <p className="font-medium mt-0.5">{order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN') : '—'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500">Produced</p>
          <p className="font-medium mt-0.5">{productionSummary.totalProduced.toLocaleString('en-IN')} kg</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500">QC Pass Rate</p>
          <p className="font-medium mt-0.5">
            {qcSummary.total === 0 ? '—' : `${((qcSummary.pass / qcSummary.total) * 100).toFixed(0)}%`}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {order.notes && (
            <div>
              <h3 className="text-sm font-medium text-slate-700 mb-1">Notes</h3>
              <p className="text-slate-600 bg-slate-50 rounded p-3">{order.notes}</p>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">Created</h3>
            <p className="text-slate-600">{new Date(order.createdAt).toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {tab === 'bom' && (
        <div>
          {bom ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <StatusBadge tone={bom.status === 'APPROVED' ? 'good' : bom.status === 'PENDING_APPROVAL' ? 'warning' : 'neutral'}>
                  {bom.status}
                </StatusBadge>
                <Link href={`/mis/bom/${order.id}`} className="text-sm text-blue-600 hover:underline">
                  Open full BOM →
                </Link>
              </div>
              <p className="text-slate-500 text-sm">{bom.stages.length} stages defined</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-3">No BOM yet for this order.</p>
              <Link href={`/mis/bom/${order.id}`} className="text-blue-600 hover:underline text-sm">
                Create BOM →
              </Link>
            </div>
          )}
        </div>
      )}

      {tab === 'production' && (
        <DataTable
          columns={prodCols}
          rows={productionLogs}
          rowKey={r => r.id}
          emptyTitle="No production logged"
          emptyBody="No production entries have been logged for this order yet."
        />
      )}

      {tab === 'qc' && (
        <DataTable
          columns={qcCols}
          rows={qcLogs}
          rowKey={r => r.id}
          emptyTitle="No QC checks"
          emptyBody="No quality checks have been recorded for this order yet."
        />
      )}

      <SlideOver open={reopenOpen} onClose={() => { setReopenOpen(false); setReopenError(null); }} title={t('order.reopen')}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">
            {order.orderNumber} · {order.status.replace(/_/g, ' ')}
          </p>
          <Input label={t('order.reopen.why')} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          {reopenError && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{reopenError}</div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleReopen} disabled={reopening || !reopenReason.trim()}>{t('order.reopen.confirm')}</Button>
            <Button variant="ghost" onClick={() => { setReopenOpen(false); setReopenError(null); }}>{t('action.cancel')}</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
