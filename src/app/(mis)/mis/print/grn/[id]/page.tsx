import { PrintButton } from '@/components/mis/print/print-button';
import { requireMisAccess } from '@/server/mis/guard';
import { getGRN } from '@/server/mis/grn';
import { notFound } from 'next/navigation';

export default async function GrnPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMisAccess();

  const grn = await getGRN(id);
  if (!grn) notFound();

  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 font-sans text-sm text-gray-900">
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <a href={`/mis/grn/${grn.id}`} className="px-4 py-2 border border-gray-200 rounded text-sm hover:bg-gray-50">Back to GRN</a>
      </div>

      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-800">
        <div>
          <div className="text-2xl font-bold text-gray-900">{companyName}</div>
          <div className="text-base font-semibold text-gray-500 mt-1">GOODS RECEIPT NOTE</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-gray-800">{grn.grnNumber}</div>
          <div className="text-xs text-gray-400 mt-1">
            Received: {new Date(grn.receivedAt ?? grn.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Printed: {printDate}</div>
          <div className="mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              grn.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
              grn.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>{grn.status}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Purchase Order</div>
          <div className="font-semibold font-mono">{grn.po?.poNumber ?? '—'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Supplier</div>
          <div className="font-semibold">{grn.po?.supplier?.name ?? '—'}</div>
        </div>
      </div>

      {grn.notes && (
        <div className="mb-6 text-sm text-gray-600 bg-gray-50 rounded p-3">
          <span className="font-medium">Notes:</span> {grn.notes}
        </div>
      )}

      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="py-2 text-left font-semibold text-gray-600 w-8">#</th>
            <th className="py-2 text-left font-semibold text-gray-600">Item / Description</th>
            <th className="py-2 text-right font-semibold text-gray-600 w-24">Ordered</th>
            <th className="py-2 text-right font-semibold text-gray-600 w-24">Received</th>
            <th className="py-2 text-left font-semibold text-gray-600 w-16">Unit</th>
            <th className="py-2 text-left font-semibold text-gray-600 w-28">Batch</th>
          </tr>
        </thead>
        <tbody>
          {grn.items.map((grnItem: any, idx: number) => {
            const poItem = grn.po?.items?.find((pi: any) => pi.id === grnItem.poItemId);
            return (
              <tr key={grnItem.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-400">{idx + 1}</td>
                <td className="py-2">
                  <div className="font-medium text-gray-900">{poItem?.description ?? '—'}</div>
                  {poItem?.item && <div className="text-xs text-gray-400">{poItem.item.name}</div>}
                  {grnItem.notes && <div className="text-xs text-gray-400 italic">{grnItem.notes}</div>}
                </td>
                <td className="py-2 text-right text-gray-600">{poItem ? Number(poItem.quantity).toLocaleString('en-IN') : '—'}</td>
                <td className="py-2 text-right font-semibold text-gray-900">{Number(grnItem.receivedQty).toLocaleString('en-IN')}</td>
                <td className="py-2 text-gray-500">{poItem?.item?.unit ?? '—'}</td>
                <td className="py-2 text-gray-400 font-mono text-xs">{grnItem.batchNo ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-8 mt-12 pt-6 border-t border-gray-200 text-xs text-gray-500">
        <div><div className="h-10" /><div className="border-t border-gray-400 pt-2 text-center">Received By</div></div>
        <div><div className="h-10" /><div className="border-t border-gray-400 pt-2 text-center">Inspected By</div></div>
        <div><div className="h-10" /><div className="border-t border-gray-400 pt-2 text-center">Authorized By</div></div>
      </div>
    </div>
  );
}
