'use client';

import { useEffect, useState } from 'react';

type Nav = { platform?: string; userAgent?: string; userAgentData?: { platform?: string } };

/** Mac-family? userAgentData first ("macOS"), then navigator.platform ("MacIntel"), then the UA. Call only on the client. */
export function detectMac(nav: Nav = navigator): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent || '');
}

/**
 * True on macOS / iOS. Resolved after mount (navigator isn't available during
 * SSR), so the first render assumes non-Mac to stay hydration-safe.
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- platform is only knowable after mount (no navigator during SSR)
    setIsMac(detectMac());
  }, []);
  return isMac;
}

/** Platform command-key label for shortcut hints: '⌘' on Mac, 'Ctrl' elsewhere. */
export function useModKey(): string {
  return useIsMac() ? '⌘' : 'Ctrl';
}

/** The search shortcut's hint text for the platform. */
export const searchHint = (mac: boolean) => (mac ? '⌘K' : 'Ctrl K');

/** Does this key event press the platform's command modifier (⌘ on Mac, Ctrl elsewhere) with K? */
export function isSearchShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return (mac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k';
}
