import { DocumentVersionBar } from './document-version-bar';

type BarProps = Parameters<typeof DocumentVersionBar>[0];

/**
 * R2-160 — a plain function (called by the page, not a component) so the page's tree contains the alert. Shown INSTEAD of a COA / job-card body when the version's frozen copy is corrupt or
 * unreadable. The whole block is `no-print` and the document body is not rendered, so the corrupt copy
 * can never be printed. The version strip stays (other versions can still be opened), and "View live
 * data" goes to the order, which always shows the current data.
 */
export function unreadableSnapshotView({ bar, orderId }: { bar: BarProps; orderId: string }) {
  return (
    <div className="no-print p-8 max-w-[794px] mx-auto font-sans text-sm text-gray-900">
      <DocumentVersionBar {...bar} />
      <div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800">
        <p className="font-semibold">This version&apos;s saved copy can&apos;t be loaded</p>
        <p>It was not printed, so a damaged copy cannot go out as an approved document. Open another version, or look at the live data.</p>
        <a href={`/mis/orders/${orderId}`} className="inline-flex min-h-11 items-center rounded-lg border border-red-300 bg-white px-4 font-medium text-red-800 hover:bg-red-100">
          View live data
        </a>
      </div>
    </div>
  );
}
