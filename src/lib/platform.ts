'use client';

import { useEffect, useState } from 'react';

/**
 * True on macOS / iOS. Resolved after mount (navigator isn't available during
 * SSR), so the first render assumes non-Mac to stay hydration-safe.
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only knowable after mount (no navigator during SSR)
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(ua));
  }, []);
  return isMac;
}

/** Platform command-key label for shortcut hints: '⌘' on Mac, 'Ctrl' elsewhere. */
export function useModKey(): string {
  return useIsMac() ? '⌘' : 'Ctrl';
}
