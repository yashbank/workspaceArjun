'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { approveDocumentVersionAction, prepareDocumentVersionAction } from '@/app/(mis)/mis/print/document-version-actions';
import { versionLabel, type DocVersionType } from '@/lib/mis/document-version';
import type { DocumentVersionView } from '@/server/mis/document-versions';

/**
 * R2-46 — the version strip on a COA / job-card print page.
 *
 * The status line prints (a reprint shows which version and whether it is approved); the buttons and
 * history do not (`no-print`). The server decides who may prepare and approve; this only hides
 * buttons a viewer cannot use.
 */
export function DocumentVersionBar({ view, fileName }: { view: DocumentVersionView; fileName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const latest = view.latest;
  // The browser's "Save as PDF" names the file after the page title: Type_OrderNo_DDMMYY_Vn.
  useEffect(() => {
    document.title = fileName;
  }, [fileName]);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; detail: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.detail);
      else router.refresh();
    });

  const tone = !latest ? 'border-red-300 bg-red-50 text-red-800' : latest.status === 'APPROVED' ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900';

  return (
    <div className="mb-4 space-y-2">
      <div data-testid="doc-version" className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tone}`}>
        {versionLabel(latest)}
        {latest?.status === 'APPROVED' && latest.approvedByName ? ` by ${latest.approvedByName}` : ''}
        {latest?.preparedByName ? ` · prepared by ${latest.preparedByName}` : ''}
        <span className="block font-mono text-xs font-normal">{fileName}</span>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {view.canPrepare && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => prepareDocumentVersionAction(view.docType as DocVersionType, view.refId))}
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50"
          >
            {latest ? `Issue V${latest.version + 1}` : 'Issue V1'}
          </button>
        )}
        {view.versions
          .filter((v) => v.canApprove)
          .map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={isPending}
              onClick={() => run(() => approveDocumentVersionAction(v.id))}
              className="inline-flex min-h-11 items-center rounded-lg bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800"
            >
              Approve V{v.version}
            </button>
          ))}
        {view.versions.length > 1 && (
          <span className="text-xs text-gray-500">
            History: {view.versions.map((v) => `V${v.version} ${v.status === 'APPROVED' ? 'approved' : 'prepared'}`).join(' · ')}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="no-print text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
