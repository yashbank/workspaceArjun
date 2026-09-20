'use client';

import { useEffect, useState } from 'react';

import { useT } from '@/components/mis/shell/locale-provider';
import { canRetry, getOfflineQueue, startAutoReplay, type QueuedItem, type QueueSnapshot } from '@/lib/mis/offline/queue';

import { registerOfflineSenders } from './offline-senders';

/**
 * The sync indicator — `08-Empty-error-offline.png`, "always visible, never a
 * surprise".
 *
 * Three states, one row each: green `All saved` with a relative time, amber
 * `N entries waiting to send` with `Offline`, red `N entries failed to send`
 * with **View**. The design note is the requirement, not decoration:
 *
 *   "A failure the worker cannot see is a failure that becomes a missing
 *    production record three weeks later. Failed is tappable."
 *
 * So the red state opens the list, showing which entry and why, with Retry.
 */
export function SyncIndicator() {
  const t = useT();
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const queue = getOfflineQueue();
    // Senders first: the queue imports no server action, so nothing can be sent
    // until the app layer has said how (Appendix B §B.9).
    registerOfflineSenders(queue);
    const unsubscribe = queue.subscribe(setSnapshot);
    const stopAuto = startAutoReplay(queue);
    return () => {
      unsubscribe();
      stopAuto();
    };
  }, []);

  // Nothing queued and nothing failed is the ordinary case; a permanently
  // green badge in the header is noise, so it only shows once there is
  // something to say or something recently synced.
  if (!snapshot || (snapshot.pending === 0 && snapshot.failed === 0 && !snapshot.lastSyncedAt)) {
    return null;
  }

  const failed = snapshot.failed > 0;
  const waiting = snapshot.pending > 0;

  const tone = failed
    ? 'bg-red-50 text-red-900'
    : waiting
      ? 'bg-amber-50 text-amber-900'
      : 'bg-white text-slate-700';
  const dot = failed ? 'bg-red-500' : waiting ? 'bg-amber-500' : 'bg-green-500';

  const label = failed
    ? `${snapshot.failed} ${snapshot.failed === 1 ? t('sync.failedOne') : t('sync.failedMany')}`
    : waiting
      ? `${snapshot.pending} ${snapshot.pending === 1 ? t('sync.waitingOne') : t('sync.waitingMany')}`
      : t('sync.allSaved');

  const right = failed ? t('sync.view') : waiting && !snapshot.online ? t('sync.offline') : relative(snapshot.lastSyncedAt, t);

  return (
    <>
      <button
        type="button"
        onClick={() => failed && setOpen(true)}
        disabled={!failed}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${tone} ${failed ? '' : 'cursor-default'}`}
        aria-label={label}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
        {right && <span className="shrink-0 font-mono text-[11px] opacity-70">{right}</span>}
      </button>

      {open && snapshot && <QueueList snapshot={snapshot} onClose={() => setOpen(false)} />}
    </>
  );
}

function QueueList({ snapshot, onClose }: { snapshot: QueueSnapshot; onClose: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);

  const retry = async (key: string) => {
    setBusy(key);
    const queue = getOfflineQueue();
    // `retry` refuses anything D17 says a retry may not release, so a stale
    // button cannot launder a hold that needs an audited override.
    if (await queue.retry(key)) await queue.replay();
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="w-full max-w-[420px] rounded-2xl bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {t('sync.queueTitle')}
          </p>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-indigo-600">
            {t('action.close')}
          </button>
        </div>

        <ul className="flex flex-col gap-2">
          {snapshot.items.map((item) => (
            <QueueRow key={item.key} item={item} busy={busy === item.key} onRetry={() => retry(item.key)} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function QueueRow({ item, busy, onRetry }: { item: QueuedItem; busy: boolean; onRetry: () => void }) {
  const t = useT();
  const blocked = item.status === 'PARKED' || item.status === 'REJECTED';

  return (
    <li
      className={`rounded-xl border p-3 ${blocked ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{item.label ?? item.kind}</p>
          <p className="font-mono text-[11px] text-slate-500">
            {new Date(item.clientRecordedAt).toLocaleString('en-IN')}
          </p>
          {/* The reason, never a bare "failed" — a worker who is not told what
              happened retypes everything. */}
          {blocked && item.detail && <p className="mt-1 text-xs text-red-900">{item.detail}</p>}
          {/* A hold a retry cannot release says so, rather than offering a button
              that would only park it again (D17). */}
          {blocked && !canRetry(item) && (
            <p className="mt-1 text-xs font-medium text-red-900">{t('sync.needsReview')}</p>
          )}
        </div>
        {canRetry(item) && (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="shrink-0 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 disabled:opacity-60"
          >
            {t('sync.retry')}
          </button>
        )}
      </div>
    </li>
  );
}

function relative(at: number | null, t: (key: 'sync.justNow' | 'sync.minutesAgo') => string): string {
  if (!at) return '';
  const minutes = Math.floor((Date.now() - at) / 60_000);
  return minutes < 1 ? t('sync.justNow') : `${minutes} ${t('sync.minutesAgo')}`;
}
