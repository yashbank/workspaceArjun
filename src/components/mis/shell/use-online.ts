'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * Is the browser online *as far as it knows*?
 *
 * `navigator.onLine` says "connected to a network", not "can reach the server" —
 * flaky factory wifi is connected and dead at the same time. So this is a hint
 * for labels ("lists as of…"); it is never what decides whether a write is
 * queued. That decision is the live attempt failing (Appendix B §B.10.1).
 *
 * The server snapshot is `true` so the first render matches the server's.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
