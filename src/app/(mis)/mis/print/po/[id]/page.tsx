import { PrintButton } from '@/components/mis/print/print-button';
import { requireMisAccess } from '@/server/mis/guard';
import { checkPermission } from '@/server/mis/auth';
import { getPO, computePoTotal } from '@/server/mis/po';
import { notFound } from 'next/navigation';
import { poPurpose, poPurposeLabel } from '@/lib/mis/po-purpose';

export default async function PoPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMisAccess();

  // A printed purchase order is a PRICED document — rate and amount on every line. Prices are the
  // Owner's (D24, F-06), so anyone else is told so rather than handed a sheet with blank money.
  if (!(await checkPermission('wages.read'))) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-6 text-sm text-gray-700">
        <p className="font-medium">A printed purchase order shows prices, and prices are visible to the Owner only.</p>
        <a href={`/mis/po/${id}`} className="mt-4 inline-block px-4 py-2 border border-gray-200 rounded text-sm hover:bg-gray-50">Back to the PO</a>
      </div>
    );
  }

  const po = await getPO(id);
  if (!po) notFound();

  const total = await computePoTotal(id);
  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';
  const statusLabel = (s: string) => s.replace(/_/g, ' ');
  const fmtINR = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 font-sans text-sm text-gray-900">
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <a href="/mis/po" className="px-4 py-2 border border-gray-200 rounded text-sm hover:bg-gray-50">Back to POs</a>
      </div>

      <div className="flex justify-between items-start mb-6 pb-4 border-b-2 border-gray-800">
        <div>
          <div className="text-2xl font-bold text-gray-900">{companyName}</div>
          <div className="text-base font-semibold text-gray-500 mt-1">PURCHASE ORDER</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold font-mono text-gray-800">{po.poNumber}</div>
          <div className="text-xs text-gray-400 mt-1">Date: {printDate}</div>
          <div className="mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              po.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
              po.status === 'PENDING_APPROVAL' ? 'bg-yellow-100 text-yellow-700' :
              po.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-600'
            }`}>{statusLabel(po.status)}</span>
          </div>
        </div>
      </div>

      {po.supplier && (
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bill To</div>
            <div className="font-semibold">{companyName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Vendor</div>
            <div className="font-semibold">{po.supplier.name}</div>
            {po.supplier.address && <div className="text-gray-500 text-xs mt-1">{po.supplier.address}</div>}
            {po.supplier.gstNo && <div className="text-gray-400 text-xs">GST: {po.supplier.gstNo}</div>}
          </div>
        </div>
      )}

      <div className="mb-6 text-sm text-gray-600 bg-gray-50 rounded p-3">
        <div><span className="font-medium">Purpose:</span> {poPurposeLabel(poPurpose(po))}</div>
        {po.bomRef && <div className="mt-1"><span className="font-medium">BOM Ref:</span> {po.bomRef}</div>}
        {po.notes && <div className="mt-1"><span className="font-medium">Notes:</span> {po.notes}</div>}
      </div>

      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200">
            <th className="py-2 text-left font-semibold text-gray-600 w-8">#</th>
            <th className="py-2 text-left font-semibold text-gray-600">Description</th>
            <th className="py-2 text-right font-semibold text-gray-600 w-20">Qty</th>
            <th className="py-2 text-left font-semibold text-gray-600 w-12">Unit</th>
            <th className="py-2 text-right font-semibold text-gray-600 w-28">Rate</th>
            <th className="py-2 text-right font-semibold text-gray-600 w-28">Amount</th>
          </tr>
        </thead>
        <tbody>
          {po.items.map((item: any, idx: number) => {
            const qty = Number(item.quantity);
            const rate = Number(item.ratePerUnit);
            const amount = qty * rate;
            return (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-400">{idx + 1}</td>
                <td className="py-2 text-gray-900">
                  <div className="font-medium">{item.description}</div>
                  {item.item && <div className="text-xs text-gray-400">{item.item.name}</div>}
                </td>
                <td className="py-2 text-right text-gray-900">{qty.toLocaleString('en-IN')}</td>
                <td className="py-2 text-gray-500">{item.item?.unit ?? '—'}</td>
                <td className="py-2 text-right text-gray-700">{fmtINR(rate)}</td>
                <td className="py-2 text-right font-medium text-gray-900">{fmtINR(amount)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-300">
            <td colSpan={4} />
            <td className="py-3 text-right font-bold text-gray-700">TOTAL</td>
            <td className="py-3 text-right font-bold text-gray-900 text-base">{total}</td>
          </tr>
        </tfoot>
      </table>

      <div className="grid grid-cols-2 gap-8 mt-12 pt-6 border-t border-gray-200 text-xs text-gray-500">
        <div>
          <p className="font-medium text-gray-700 mb-2">Terms and Conditions</p>
          <p>1. Please supply goods as per specifications above.</p>
          <p>2. Invoice must quote this PO number.</p>
          <p>3. Goods subject to quality inspection on receipt.</p>
        </div>
        <div className="text-right">
          <div className="h-12" />
          <div className="border-t border-gray-400 pt-2 text-center">Authorized Signature</div>
          <div className="text-center mt-1">{companyName}</div>
        </div>
      </div>
    </div>
  );
}
