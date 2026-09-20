'use client';

import { useEffect } from 'react';

/**
 * Registers the offline worker and tells it whose session this is.
 *
 * What the worker caches is D16 in `docs/DECISIONS.md` — exactly two documents.
 * This component only registers it and announces the user: the worker keeps the
 * cached pages tied to that user and wipes them when a *different* person
 * arrives, so one person's pages are never shown under another's session.
 *
 * Production only. A worker in `next dev` serves stale bundles and wastes hours,
 * and nothing about offline behaviour can be judged against a dev server.
 *
 * Silent on failure, on purpose: the app is fully usable without the worker (it
 * is online-only, exactly as before). A registration error is not something the
 * person at the machine can act on.
 */
export function ServiceWorkerRegistration({ userId }: { userId: string }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let cancelled = false;
    (async () => {
      try {
        // Scope /mis/, narrower than the script's location: the worker can only
        // ever see the MIS, never the file manager that shares this origin.
        await navigator.serviceWorker.register('/sw.js', { scope: '/mis/' });
        const ready = await navigator.serviceWorker.ready;
        if (!cancelled) ready.active?.postMessage({ type: 'MIS_SESSION', userId });
      } catch {
        /* see above */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}
