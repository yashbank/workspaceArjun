/** Pure: is this a Mac-family platform string (userAgentData.platform is "macOS", navigator.platform is "MacIntel")? */
export function isMacPlatform(platform: string | null | undefined): boolean {
  return /Mac|iPhone|iPad/i.test(platform ?? '');
}

/** Browser read: userAgentData first, navigator.platform as the fallback. Call only on the client. */
export function detectMac(nav: { platform?: string; userAgentData?: { platform?: string } } = navigator): boolean {
  return isMacPlatform(nav.userAgentData?.platform || nav.platform);
}

/** The shortcut hint text for the platform. */
export const searchHint = (mac: boolean) => (mac ? '⌘K' : 'Ctrl K');

/** Does this key event press the platform's command modifier (⌘ on Mac, Ctrl elsewhere) with K? */
export function isSearchShortcut(e: { key: string; metaKey: boolean; ctrlKey: boolean }, mac: boolean): boolean {
  return (mac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'k';
}
