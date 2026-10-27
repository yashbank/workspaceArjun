'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import {
  approveDocumentVersionAction,
  prepareDocumentVersionAction,
  updateDocumentVersionToLatestAction,
  voidDocumentVersionAction,
} from '@/app/(mis)/mis/print/document-version-actions';
import type { DocDataSource } from '@/lib/mis/document-snapshot';
import { versionLabel, type DocVersionType } from '@/lib/mis/document-version';
import type { DocumentVersionRow, DocumentVersionView } from '@/server/mis/document-versions';

/**
 * R2-46 — the version strip on a COA / job-card print page.
 *
 * The status line prints (a reprint shows which version and whether it is approved); the buttons and
 * history do not (`no-print`). The server decides who may prepare and approve; this only hides
 * buttons a viewer cannot use.
 *
 * R2-46 follow-up: `selected` is the version this page is showing (`?v=N`, default the newest) and
 * `dataSource` says whether its body is the frozen snapshot or live data.
 */
const SOURCE_NOTE: Record<DocDataSource, string> = {
  SNAPSHOT: 'Frozen copy — printed exactly as approved',
  LIVE: 'Live data — frozen when approved',
  LIVE_NO_SNAPSHOT: 'No snapshot (approved before snapshots) — showing live data. Use "Update to latest" to issue a frozen version.',
};

const STATUS_WORD = { APPROVED: 'approved', PREPARED: 'prepared', VOID: 'discarded' } as const;
const STATUS_TITLE = { APPROVED: 'Approved', PREPARED: 'Prepared', VOID: 'Discarded' } as const;

export function DocumentVersionBar({
  view,
  fileName,
  selected,
  dataSource,
}: {
  view: DocumentVersionView;
  fileName: string;
  selected?: DocumentVersionRow | null;
  dataSource?: DocDataSource;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const newest = view.latest;
  const latest = selected ?? newest;
  // R2-158: discard asks for a reason first.
  const [discarding, setDiscarding] = useState<DocumentVersionRow | null>(null);
  const [reason, setReason] = useState('');
  // The number the next issue takes: one more than the highest ever, a discarded number is not reused.
  const nextNumber = view.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  const showUpdate = Boolean(view.canUpdateToLatest && newest && newest.status === 'APPROVED');
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
        {newest && latest && latest.id !== newest.id ? ` · older version (V${newest.version} is the newest)` : ''}
        {latest && dataSource ? (
          <span data-testid="doc-source" className="block text-xs font-normal">
            {SOURCE_NOTE[dataSource]}
          </span>
        ) : null}
        <span className="block font-mono text-xs font-normal">{fileName}</span>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {showUpdate && newest && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => updateDocumentVersionToLatestAction(newest.id))}
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50"
          >
            {`Update to latest (V${newest.version + 1})`}
          </button>
        )}
        {/* R2-156: one pending version at a time: no Issue V(n+1) while the newest is PREPARED */}
        {view.canPrepare && !showUpdate && newest?.status !== 'PREPARED' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => prepareDocumentVersionAction(view.docType as DocVersionType, view.refId))}
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50"
          >
            {`Issue V${nextNumber}`}
          </button>
        )}
        {/* R2-157: only the newest version can be approved */}
        {view.versions
          .filter((v) => v.canApprove && v.id === newest?.id)
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
        {view.versions
          .filter((v) => v.canVoid)
          .map((v) => (
            <button
              key={`void-${v.id}`}
              type="button"
              disabled={isPending}
              onClick={() => {
                setDiscarding(v);
                setReason('');
              }}
              className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-4 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Discard V{v.version}
            </button>
          ))}
        {view.versions.length > 1 && (
          <span className="text-xs text-gray-500">
            History: {view.versions.map((v) => `V${v.version} ${STATUS_WORD[v.status]}`).join(' · ')}
          </span>
        )}
      </div>
      {discarding && (
        <div className="no-print flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-xs text-gray-500">Reason for discarding</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-12 w-72 max-w-full rounded-lg border border-gray-300 px-3 text-base"
            />
          </label>
          <button
            type="button"
            disabled={isPending || reason.trim() === ''}
            onClick={() => {
              const target = discarding;
              run(() => voidDocumentVersionAction(target.id, reason.trim()));
              setDiscarding(null);
            }}
            className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
          >
            Confirm discard
          </button>
          <button
            type="button"
            onClick={() => setDiscarding(null)}
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-4 text-sm hover:bg-gray-50"
          >
            Keep it
          </button>
        </div>
      )}
      {view.versions.length > 1 && (
        <nav aria-label="Versions" className="no-print flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Versions:</span>
          {view.versions.map((v) => (
            <a
              key={v.id}
              href={`?v=${v.version}`}
              aria-current={latest?.id === v.id ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg border px-3 ${latest?.id === v.id ? 'border-gray-900 font-semibold' : 'border-gray-300 hover:bg-gray-50'}`}
            >
              {`V${v.version} · ${STATUS_TITLE[v.status]}`}
            </a>
          ))}
        </nav>
      )}
      {error && (
        <p role="alert" className="no-print text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
