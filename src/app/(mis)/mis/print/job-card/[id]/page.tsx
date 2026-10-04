import { isUuid } from '@/lib/mis/ids';
import { formatFactoryDateTime } from '@/lib/mis/factory-time';
import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { getOrder } from '@/server/mis/orders';
import { getBom } from '@/server/mis/bom';
import { getProductionSummary } from '@/server/mis/production';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { getPhasesForOrder } from '@/server/mis/job-phases';
import { notFound } from 'next/navigation';

/**
 * Human label for a phase's state on the printed record. Plain words, no
 * colour — this is paper. REOPENED reads as its own state, never as "signed"
 * (Appendix A §A.2): a phase signed once and withdrawn must never again look
 * like one that was never signed.
 */
function phaseStatusLabel(status: string): string {
  switch (status) {
    case 'SIGNED_OFF': return 'Signed off';
    case 'IN_PROGRESS': return 'In progress';
    case 'REOPENED': return 'Reopened';
    case 'NOT_APPLICABLE': return 'Not on this job card';
    default: return 'Pending';
  }
}

export default async function JobCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const order = await getOrder(id);
  if (!order) notFound();

  // Not caught to an empty list: every role that can reach `getOrder` (orders.read)
  // also holds `phase.read` (OWNER/ADMIN/SUPERVISOR/QC — the only four), so a
  // failure here is a real bug, not a permission gap to paper over with a lie.
  const [bom, prodSummary, phases, timeZone] = await Promise.all([
    getBom(id).catch(() => null),
    getProductionSummary(id).catch(() => ({ totalProduced: 0, totalWaste: 0, entries: 0 })),
    getPhasesForOrder(id),
    getFactoryTimezone(),
  ]);

  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const deliveryDate = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="p-8 max-w-[794px] mx-auto font-sans text-sm text-gray-900">
      {/* Print button */}
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <a href={`/mis/orders/${id}`} className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50">
          ← Back to Order
        </a>
      </div>

      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-900 pb-4 mb-6">
        <div>
          <h1 className="text-xl font-bold">BHASKAR PAPER PRODUCTS</h1>
          <p className="text-gray-600 text-xs mt-0.5">Batch Production Record</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg font-mono">{order.orderNumber}</p>
          <p className="text-xs text-gray-500">Print Date: {printDate}</p>
        </div>
      </div>

      {/* Order info grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Customer</span>
          <p className="font-medium mt-0.5">{order.customer?.name ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Delivery Date</span>
          <p className="font-medium mt-0.5">{deliveryDate}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Description</span>
          <p className="font-medium mt-0.5">{order.description ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Status</span>
          <p className="font-medium mt-0.5">{order.status?.replace(/_/g, ' ') ?? '—'}</p>
        </div>
      </div>

      {/* BOM stages */}
      {bom && bom.stages.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Manufacturing Stages</h2>
          {bom.stages.map((stage, i) => (
            <div key={stage.id} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-gray-900 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{i + 1}</span>
                <span className="font-semibold">{stage.stageName}</span>
                {stage.process && <span className="text-gray-500 text-xs">({stage.process.name})</span>}
              </div>
              {stage.materials.length > 0 && (
                <table className="w-full text-xs mt-1 ml-7">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200">
                      <th className="text-left py-1">Material</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-left py-1 pl-2">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.materials.map((m) => (
                      <tr key={m.id} className="border-b border-gray-100">
                        <td className="py-1">{m.description}</td>
                        <td className="py-1 text-right">{Number(m.quantity).toLocaleString('en-IN')}</td>
                        <td className="py-1 pl-2">{m.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Work flow — the BPR's own per-section sign-off (DEVELOPMENT_GUIDE.md Appendix A).
          An order with no phase plan is not silently blank: D10 says an ungated
          order must say so, not read as a passed gate. */}
      <div className="mb-8">
        <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Work Flow — Section Sign-Off</h2>
        {phases.length === 0 ? (
          <p className="text-gray-500 text-xs italic">No phase plan · not gated — this order has no planned work-flow sections.</p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-300">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Section</th>
                  <th className="text-left py-1 pr-2">Status</th>
                  <th className="text-left py-1 pr-2">In-Charge</th>
                  <th className="text-left py-1 pr-2">Started</th>
                  <th className="text-left py-1 pr-2">Signed Off</th>
                  <th className="text-left py-1">Signature</th>
                </tr>
              </thead>
              <tbody>
                {phases.map((phase) => {
                  const skipped = phase.status === 'NOT_APPLICABLE';
                  return (
                    <tr key={phase.id} className={`border-b border-gray-100 ${skipped ? 'text-gray-400 italic' : ''}`}>
                      <td className="py-1.5 pr-2 align-top">{phase.sequence}</td>
                      <td className="py-1.5 pr-2 align-top font-medium">{phase.process.name}</td>
                      <td className="py-1.5 pr-2 align-top">
                        {phaseStatusLabel(phase.status)}
                        {skipped && phase.notApplicableReason ? ` (${phase.notApplicableReason})` : ''}
                        {phase.downstreamFlagged ? ' · an earlier section was reopened after this one started' : ''}
                      </td>
                      <td className="py-1.5 pr-2 align-top">{phase.inCharge?.name ?? (skipped ? '—' : 'Not assigned')}</td>
                      <td className="py-1.5 pr-2 align-top">{phase.startedAt ? formatFactoryDateTime(phase.startedAt, timeZone) : '—'}</td>
                      <td className="py-1.5 pr-2 align-top">{phase.signedOffAt ? formatFactoryDateTime(phase.signedOffAt, timeZone) : '—'}</td>
                      <td className="py-1.5 align-top">{skipped ? '—' : <span className="inline-block w-24 border-b border-gray-400">&nbsp;</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] italic text-gray-600">
              Section receiving BPR should not accept BPR if it is not signed by previous section.
            </p>
          </>
        )}
      </div>

      {/* Production summary */}
      <div className="mb-8">
        <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Production Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Log Entries</p>
            <p className="font-bold text-lg">{prodSummary.entries}</p>
          </div>
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Total Produced</p>
            <p className="font-bold text-lg">{Number(prodSummary.totalProduced).toLocaleString('en-IN')} kg</p>
          </div>
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Total Waste</p>
            <p className="font-bold text-lg">{Number(prodSummary.totalWaste).toLocaleString('en-IN')} kg</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="mb-8">
          <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-2">Notes</h2>
          <p className="text-gray-700 text-sm">{order.notes}</p>
        </div>
      )}

      {/* Each work-flow section carries its own sign-off above; this is not a second
          signature zone, only a record of who pulled this print. */}
      <div className="mt-16 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Printed {printDate}
      </div>
    </div>
  );
}
