'use client';
import { useState, useTransition } from 'react';
import { Select } from '@/components/mis/kit/select';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';

type Order = { id: string; orderNumber: string; description: string | null; status: string };
type TraceResult = {
  order: any;
  bom: any;
  productionLogs: any[];
  qcChecks: any[];
  documents: any[];
  totalProduced: number;
  totalWaste: number;
  passChecks: number;
  failChecks: number;
};

function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function TraceabilityScreen({ orders }: { orders: Order[] }) {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const handleSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    if (!orderId) { setTrace(null); return; }
    setError('');
    startTransition(async () => {
      try {
        const res = await fetch(`/api/mis/trace/${orderId}`);
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setTrace(data);
      } catch {
        setError('Could not load trace data.');
      }
    });
  };

  const orderOptions = [
    { value: '', label: '— Select Order —' },
    ...orders.map(o => ({ value: o.id, label: `${o.orderNumber}${o.description ? ` — ${o.description}` : ''}` })),
  ];

  const yieldPct = trace && trace.totalProduced > 0
    ? (((trace.totalProduced - trace.totalWaste) / trace.totalProduced) * 100).toFixed(1)
    : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Traceability</h1>

      <div className="max-w-sm mb-8">
        <Select label="Select Order" value={selectedOrderId} onChange={handleSelect} options={orderOptions} />
      </div>

      {isPending && <p className="text-slate-500">Loading trace…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {trace && trace.order && (
        <div className="space-y-6">
          {/* Order header */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h2 className="text-xl font-bold font-mono">{trace.order.orderNumber}</h2>
              <StatusBadge tone={statusTone(trace.order.status)}>{trace.order.status.replace(/_/g, ' ')}</StatusBadge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-slate-500">Customer</span><p className="font-medium">{trace.order.customer?.name ?? '—'}</p></div>
              <div><span className="text-slate-500">Delivery</span><p className="font-medium">{trace.order.deliveryDate ? new Date(trace.order.deliveryDate).toLocaleDateString('en-IN') : '—'}</p></div>
              <div><span className="text-slate-500">Produced</span><p className="font-medium">{Number(trace.totalProduced).toLocaleString('en-IN')} kg</p></div>
              <div><span className="text-slate-500">Yield</span><p className="font-medium">{yieldPct ? `${yieldPct}%` : '—'}</p></div>
            </div>
          </div>

          {/* BOM */}
          <Section title="Bill of Materials" count={trace.bom?.stages?.length ?? 0}>
            {trace.bom ? (
              <div className="space-y-3">
                {trace.bom.stages?.map((stage: any, i: number) => (
                  <div key={stage.id} className="flex gap-3 items-start">
                    <span className="bg-slate-200 text-slate-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="font-medium text-sm">{stage.stageName}</p>
                      {stage.materials?.length > 0 && (
                        <p className="text-xs text-slate-500 mt-0.5">{stage.materials.length} material(s)</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-slate-500 text-sm">No BOM found.</p>}
          </Section>

          {/* Production */}
          <Section title="Production Log" count={trace.productionLogs.length}>
            {trace.productionLogs.length > 0 ? (
              <div className="space-y-2">
                {trace.productionLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-4 text-sm border-b border-slate-100 pb-2">
                    <span className="text-slate-500 w-24 flex-shrink-0">{new Date(log.loggedAt).toLocaleDateString('en-IN')}</span>
                    <span className="font-medium">{Number(log.qtyProduced).toLocaleString('en-IN')} {log.unit}</span>
                    <span className="text-slate-500">{log.employee?.name ?? '—'}</span>
                    <span className="text-slate-500">{log.machine?.name ?? '—'}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-slate-500 text-sm">No production logged.</p>}
          </Section>

          {/* QC */}
          <Section title="Quality Checks" count={trace.qcChecks.length}>
            {trace.qcChecks.length > 0 ? (
              <div className="space-y-2">
                {trace.qcChecks.map((check: any) => (
                  <div key={check.id} className="flex items-center gap-4 text-sm border-b border-slate-100 pb-2">
                    <span className="text-slate-500 w-24 flex-shrink-0">{new Date(check.checkTime).toLocaleDateString('en-IN')}</span>
                    <span className="font-medium">{check.parameterName}</span>
                    <StatusBadge tone={check.result === 'PASS' ? 'good' : check.result === 'FAIL' ? 'critical' : 'neutral'}>{check.result}</StatusBadge>
                    <span className="text-slate-500">{check.checkBy?.name ?? '—'}</span>
                  </div>
                ))}
                <div className="flex gap-4 text-sm pt-2">
                  <span className="text-green-700 font-medium">✓ {trace.passChecks} Pass</span>
                  {trace.failChecks > 0 && <span className="text-red-700 font-medium">✗ {trace.failChecks} Fail</span>}
                </div>
              </div>
            ) : <p className="text-slate-500 text-sm">No QC checks recorded.</p>}
          </Section>

          {/* Documents */}
          <Section title="Documents" count={trace.documents.length}>
            {trace.documents.length > 0 ? (
              <div className="space-y-2">
                {trace.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center gap-3 text-sm">
                    <span className="font-medium">{doc.name}</span>
                    <a href={doc.filePath} target="_blank" rel="noopener" className="text-blue-600 hover:underline text-xs">Download</a>
                  </div>
                ))}
              </div>
            ) : <p className="text-slate-500 text-sm">No documents attached.</p>}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <span className="bg-slate-100 text-slate-600 text-xs rounded-full px-2 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}
