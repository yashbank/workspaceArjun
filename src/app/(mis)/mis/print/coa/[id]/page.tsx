import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { unreadableSnapshotView } from '@/components/mis/print/snapshot-unreadable';
import { PrintButton } from '@/components/mis/print/print-button';
import { DocumentVersionBar } from '@/components/mis/print/document-version-bar';
import { docFileName } from '@/lib/mis/document-version';
import { coaSnapshotFrom, docDataSource, parseVersionParam, SnapshotUnreadableError, type CoaSnapshot, type QcInput } from '@/lib/mis/document-snapshot';
import { getDocumentVersionSnapshot, getDocumentVersionView } from '@/server/mis/document-versions';
import { getOrder } from '@/server/mis/orders';
import { getQcForOrder } from '@/server/mis/qc';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { formatFactoryDate, formatFactoryDateTime } from '@/lib/mis/factory-time';
import { latestVerdict } from '@/lib/mis/qc-verdict';
import { notFound } from 'next/navigation';

export default async function CoaPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ v?: string | string[] }>;
}) {
  const { id } = await params;
  const requestedVersion = parseVersionParam((await searchParams)?.v);
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const order = await getOrder(id);
  if (!order) notFound();
  // getQcForOrder's rows are checkTime/checkBy/defectType+notes — NOT checkedAt/checkedBy/
  // defectDescription, which this page was reading before (always undefined: "Invalid Date" in
  // the Date column, "—" in Checked By and Notes/Defect on every row of every COA ever printed).
  // B75: NO `.catch(() => [])`. A load failure reaches `error.tsx` ("do not issue this certificate"); an empty
  // list here would print as a clean "No quality checks recorded".
  const liveQc = (await getQcForOrder(id)) as unknown as QcInput[];
  const timeZone = await getFactoryTimezone();
  // R2-46: a version list that cannot be loaded throws to error.tsx. (An unreadable frozen copy is the one handled case, R2-160.)
  const docVersions = await getDocumentVersionView('COA', id);
  // R2-46 follow-up: `?v=N` picks a version (default the newest). An APPROVED one prints its frozen
  // snapshot; a PREPARED one, an unissued doc and a legacy approved row with no snapshot print live.
  const selected = (requestedVersion != null ? docVersions.versions.find((v) => v.version === requestedVersion) : undefined) ?? docVersions.latest;
  const dataSource = docDataSource(selected);
  let frozen: CoaSnapshot | null = null;
  if (dataSource === 'SNAPSHOT' && selected) {
    try {
      frozen = (await getDocumentVersionSnapshot('COA', id, selected.id)) as CoaSnapshot | null;
    } catch (error) {
      // R2-160: a corrupt frozen copy shows an inline non-printable alert (and is never printed). Anything else still throws.
      if (!(error instanceof SnapshotUnreadableError)) throw error;
      const fileName = docFileName('COA', order.orderNumber, new Date(selected.preparedAt), selected.version, timeZone);
      return unreadableSnapshotView({ orderId: id, bar: { view: docVersions, selected, dataSource, fileName } });
    }
  }
  const doc: CoaSnapshot = frozen ?? coaSnapshotFrom(order, liveQc, new Date());
  const qcLogs = doc.qcLogs;

  // A frozen copy carries the date it was frozen, so its reprint is identical.
  const printDate = formatFactoryDate(new Date(doc.capturedAt), timeZone);
  const passCount = qcLogs.filter(q => q.result === 'PASS').length;
  const failCount = qcLogs.filter(q => q.result === 'FAIL').length;
  // B74: only the LATEST check per stage + parameter counts, so a failure fixed by a later pass is resolved.
  const verdict = latestVerdict(qcLogs).overall;
  const overallResult = qcLogs.length === 0 ? 'N/A — no checks recorded' : verdict === 'NA' ? 'N/A' : verdict;
  // B81: a certificate for an order that is not finished is a draft, and says so in red.
  const isDraft = doc.order.status !== 'COMPLETED' && doc.order.status !== 'DELIVERED';

  return (
    <div className="p-8 max-w-[794px] mx-auto font-sans text-sm text-gray-900">
      {isDraft && (
        <div role="alert" className="mb-4 border-2 border-red-600 bg-red-50 px-4 py-2 text-center font-bold uppercase tracking-wide text-red-700">
          {`DRAFT CERTIFICATE — order is ${doc.order.status}`}
        </div>
      )}
      {/* R2-46: which controlled version this is, and its sign-off */}
      <DocumentVersionBar
        view={docVersions}
        selected={selected}
        dataSource={dataSource}
        fileName={docFileName('COA', doc.order.orderNumber, selected ? new Date(selected.preparedAt) : new Date(), selected?.version ?? null, timeZone)}
      />
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
          <p className="font-bold text-lg font-mono">{doc.order.orderNumber}</p>
          <p className="text-xs text-gray-500">Date: {printDate}</p>
        </div>
      </div>

      {/* Order info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
        <div>
          <span className="text-xs text-gray-500 uppercase">Customer</span>
          <p className="font-medium mt-0.5">{doc.order.customerName ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Product / Description</span>
          <p className="font-medium mt-0.5">{doc.order.description ?? '—'}</p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Delivery Date</span>
          <p className="font-medium mt-0.5">
            {doc.order.deliveryDate ? formatFactoryDate(new Date(doc.order.deliveryDate), timeZone) : '—'}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase">Overall Result</span>
          <p className={`font-bold mt-0.5 text-lg ${verdict === 'PASS' && qcLogs.length > 0 ? 'text-green-700' : verdict === 'FAIL' ? 'text-red-700' : 'text-gray-500'}`}>
            {overallResult}
          </p>
        </div>
      </div>

      {/* QC checks table */}
      <h2 className="font-bold text-sm uppercase tracking-wide border-b border-gray-300 pb-1 mb-3">Quality Parameters</h2>
      {qcLogs.length === 0 ? (
        <p className="text-gray-500 italic">No quality checks recorded.</p>
      ) : (
        // `overflow-x-auto`: 5 columns including a free-text Notes/Defect column don't fit a
        // 390px phone screen on-screen before print — scrolls inside its own box instead of
        // widening the whole page (the `@page { size: A4 }` print layout is unaffected).
        <div className="overflow-x-auto">
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
              {qcLogs.map((q) => (
                <tr key={q.id} className="border border-gray-200">
                  <td className="p-2">{q.parameterName}</td>
                  <td className={`p-2 font-bold ${q.result === 'PASS' ? 'text-green-700' : q.result === 'FAIL' ? 'text-red-700' : 'text-gray-500'}`}>
                    {q.result}
                  </td>
                  <td className="p-2">{[q.defectType, q.notes].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="p-2">{q.checkByName ?? '—'}</td>
                  <td className="p-2">{formatFactoryDateTime(new Date(q.checkTime), timeZone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
