import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { PrintButton } from '@/components/mis/print/print-button';
import { getOrder } from '@/server/mis/orders';
import { getQcForOrder } from '@/server/mis/qc';
import { notFound } from 'next/navigation';

export default async function CoaPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const order = await getOrder(id);
  if (!order) notFound();
  const qcLogs = (await getQcForOrder(id).catch(() => [])) as any[];

  const printDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const passCount = qcLogs.filter(q => q.result === 'PASS').length;
  const failCount = qcLogs.filter(q => q.result === 'FAIL').length;
  const overallResult = failCount === 0 && passCount > 0 ? 'PASS' : failCount > 0 ? 'FAIL' : 'N/A';

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
          <p className="text-gray-600 text-xs mt-0.5">Certificate of Analysis</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-lg font-mono">{(order as any).orderNumber}</p>
          <p className="text-xs text-gray-500">Date: {printDate}</p>
        </div>
      </div>

      {/* Order info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
        <div>
          <span className="text-xs text-gray-500 uppercase">Customer</span>
          <p className="font-medium mt-0.5">{(order as any).customer?.name ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Product / Description</span>
          <p className="font-medium mt-0.5">{(order as any).description ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Delivery Date</span>
          <p className="font-medium mt-0.5">
            {(order as any).deliveryDate ? new Date((order as any).deliveryDate).toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Overall Result</span>
          <p className={`font-bold mt-0.5 text-lg ${overallResult === 'PASS' ? 'text-green-700' : overallResult === 'FAIL' ? 'text-red-700' : 'text-gray-500'}`}>
            {overallResult}
          </p>
        </div>
      </div>

      {/* QC checks table */}
      <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Quality Parameters</h2>
      {qcLogs.length === 0 ? (
        <p className="text-gray-500 italic">No quality checks recorded.</p>
      ) : (
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left p-2 border border-gray-200">Parameter</th>
              <th className="text-left p-2 border border-gray-200">Result</th>
              <th className="text-left p-2 border border-gray-200">Notes / Defect</th>
              <th className="text-left p-2 border border-gray-200">Checked By</th>
              <th className="text-left p-2 border border-gray-200">Date</th>
            </tr>
          </thead>
          <tbody>
            {qcLogs.map((q: any) => (
              <tr key={q.id} className="border border-gray-200">
                <td className="p-2">{q.parameterName}</td>
                <td className={`p-2 font-bold ${q.result === 'PASS' ? 'text-green-700' : q.result === 'FAIL' ? 'text-red-700' : 'text-gray-500'}`}>
                  {q.result}
                </td>
                <td className="p-2">{q.defectDescription ?? '—'}</td>
                <td className="p-2">{q.checkedBy?.name ?? '—'}</td>
                <td className="p-2">{new Date(q.checkedAt).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Summary */}
      <div className="flex gap-6 mt-6 mb-10">
        <span className="text-sm text-gray-500">Total checks: <strong>{qcLogs.length}</strong></span>
        <span className="text-sm text-green-700">Pass: <strong>{passCount}</strong></span>
        <span className="text-sm text-red-700">Fail: <strong>{failCount}</strong></span>
      </div>

      {/* Signature */}
      <div className="grid grid-cols-3 gap-8 mt-10 pt-4 border-t border-gray-200">
        {['QC Officer', 'Production Manager', 'Authorised Signatory'].map(role => (
          <div key={role} className="text-center">
            <div className="border-b border-gray-400 mb-1 h-10" />
            <p className="text-xs text-gray-500">{role}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-8">
        This certificate is computer generated and is valid without signature.
      </p>
    </div>
  );
}
