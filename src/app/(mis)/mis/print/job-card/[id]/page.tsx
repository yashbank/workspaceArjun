import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { getOrder } from '@/server/mis/orders';
import { getBom } from '@/server/mis/bom';
import { getProductionSummary } from '@/server/mis/production';
import { notFound } from 'next/navigation';

export default async function JobCardPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const order = await getOrder(id);
  if (!order) notFound();

  const [bom, prodSummary] = await Promise.all([
    getBom(id).catch(() => null),
    getProductionSummary(id).catch(() => ({ totalProduced: 0, totalWaste: 0, entries: 0 })),
  ]);

  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const deliveryDate = (order as any).deliveryDate ? new Date((order as any).deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

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
          <p className="text-gray-600 text-xs mt-0.5">Manufacturing Job Card</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg font-mono">{(order as any).orderNumber}</p>
          <p className="text-xs text-gray-500">Print Date: {printDate}</p>
        </div>
      </div>

      {/* Order info grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Customer</span>
          <p className="font-medium mt-0.5">{(order as any).customer?.name ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Delivery Date</span>
          <p className="font-medium mt-0.5">{deliveryDate}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Description</span>
          <p className="font-medium mt-0.5">{(order as any).description ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">Status</span>
          <p className="font-medium mt-0.5">{(order as any).status?.replace(/_/g, ' ') ?? '—'}</p>
        </div>
      </div>

      {/* BOM stages */}
      {bom && (bom as any).stages && (bom as any).stages.length > 0 && (
        <div className="mb-8">
          <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Manufacturing Stages</h2>
          {(bom as any).stages.map((stage: any, i: number) => (
            <div key={stage.id} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-gray-900 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">{i + 1}</span>
                <span className="font-semibold">{stage.stageName}</span>
                {stage.process && <span className="text-gray-500 text-xs">({stage.process.name})</span>}
              </div>
              {stage.materials && stage.materials.length > 0 && (
                <table className="w-full text-xs mt-1 ml-7">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200">
                      <th className="text-left py-1">Material</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-left py-1 pl-2">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.materials.map((m: any) => (
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

      {/* Production summary */}
      <div className="mb-8">
        <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Production Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Log Entries</p>
            <p className="font-bold text-lg">{(prodSummary as any).entries}</p>
          </div>
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Total Produced</p>
            <p className="font-bold text-lg">{Number((prodSummary as any).totalProduced).toLocaleString('en-IN')} kg</p>
          </div>
          <div className="border border-gray-200 rounded p-3 text-center">
            <p className="text-gray-500 text-xs">Total Waste</p>
            <p className="font-bold text-lg">{Number((prodSummary as any).totalWaste).toLocaleString('en-IN')} kg</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      {(order as any).notes && (
        <div className="mb-8">
          <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-2">Notes</h2>
          <p className="text-gray-700 text-sm">{(order as any).notes}</p>
        </div>
      )}

      {/* Signature block */}
      <div className="grid grid-cols-3 gap-8 mt-16 pt-4 border-t border-gray-200">
        {['Prepared By', 'Supervisor', 'QC Sign-off'].map(role => (
          <div key={role} className="text-center">
            <div className="border-b border-gray-400 mb-1 h-10" />
            <p className="text-xs text-gray-500">{role}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
