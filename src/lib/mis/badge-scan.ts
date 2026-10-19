/**
 * R2-105 — turning what a camera (or a keyboard-wedge scanner, or a person typing) produced into
 * an employee. The printed badge QR encodes the bare employee code and nothing else (print/badge),
 * so the happy path is "the string IS the code". A few tolerated wrappers keep a re-encoded or
 * hand-typed badge from failing for a cosmetic reason.
 */

const MAX_LEN = 64;
// eslint-disable-next-line no-control-regex -- scanners can append CR/LF/TAB; strip them
const CONTROL = /[\u0000-\u001f\u007f]/g;
const CODE_SHAPE = /^[A-Z0-9][A-Z0-9._\-/]*$/;

/** Returns the normalised (upper-case) badge code, or null when the text cannot be one. */
export function parseScannedBadge(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let text = raw.replace(CONTROL, '').trim();
  if (!text || text.length > 512) return null;

  // A URL: take ?code= / ?badge=, else the last path segment.
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const fromQuery = url.searchParams.get('code') ?? url.searchParams.get('badge');
      text = fromQuery ?? decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    } catch {
      return null;
    }
  } else {
    // "badge:EMP001" / "code=EMP001"
    const prefixed = /^(?:badge|code|emp|employee)\s*[:=]\s*(.+)$/i.exec(text);
    if (prefixed) text = prefixed[1].trim();
  }

  const code = text.replace(/\s+/g, '').toUpperCase();
  if (!code || code.length > MAX_LEN || !CODE_SHAPE.test(code)) return null;
  return code;
}

export type ScanResult<T> =
  | { kind: 'FOUND'; employee: T; code: string }
  | { kind: 'UNKNOWN'; code: string }
  | { kind: 'INVALID' };

/** Matches a scan to the roster by employee code, case-insensitively. */
export function resolveScan<T extends { employeeCode: string }>(raw: string | null | undefined, employees: readonly T[]): ScanResult<T> {
  const code = parseScannedBadge(raw);
  if (!code) return { kind: 'INVALID' };
  const employee = employees.find((e) => e.employeeCode.trim().toUpperCase() === code);
  return employee ? { kind: 'FOUND', employee, code } : { kind: 'UNKNOWN', code };
}
