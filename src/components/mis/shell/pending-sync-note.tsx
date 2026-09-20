'use client';

import { useT } from '@/components/mis/shell/locale-provider';
import { useQueueSnapshot } from '@/components/mis/shell/use-queue-snapshot';

/**
 * A one-line, in-place statement of what is still on this device.
 *
 * The header's sync indicator already says this everywhere; this repeats it on
 * the screens where the entry was made, because "did my entry go?" is asked at
 * the press, not in the header. Amber while entries are waiting, red once any has
 * failed — the design's own rule that a failure the worker cannot see becomes a
 * missing production record three weeks later (`08-Empty-error-offline.png`).
 *
 * Renders nothing when the queue is empty: a permanent "all saved" is noise.
 */
export function PendingSyncNote({ className = '' }: { className?: string }) {
  const t = useT();
  const snapshot = useQueueSnapshot();
  if (!snapshot || (snapshot.pending === 0 && snapshot.failed === 0)) return null;

  const failed = snapshot.failed > 0;
  const count = failed ? snapshot.failed : snapshot.pending;
  const label = failed
    ? count === 1 ? t('sync.failedOne') : t('sync.failedMany')
    : count === 1 ? t('sync.waitingOne') : t('sync.waitingMany');

  return (
    <p
      role="status"
      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
        failed ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'
      } ${className}`}
    >
      {count} {label}
    </p>
  );
}
