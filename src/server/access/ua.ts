/**
 * Coarse, human-friendly device label from a User-Agent string. Browsers can't
 * expose the real OS device name, so we derive a readable "Browser on OS" label
 * (e.g. "Chrome on macOS") for the Approved Devices list. Pure + testable.
 */
export function describeBrowser(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  // Order matters: iOS UAs contain "like Mac OS X" and Android UAs contain
  // "Linux", so check the more specific platforms first.
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} on ${os}` : browser;
}
