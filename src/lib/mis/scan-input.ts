/**
 * R2-68 / R2-78 — turning what a barcode / QR scanner read into an item.
 *
 * A camera returns a raw string. Depending on how the label was printed it is the bare item code ("PPR-0012"),
 * a SKU, a URL ending in the code, a "CODE:PPR-0012" style tag, or a small JSON object. This module normalises
 * all of those to candidate codes and matches them against the picker's items. If nothing matches the cart tells
 * the person and they type instead — scanning only ever ADDS a convenience, typing always works.
 *
 * Pure: no React, no browser APIs (the camera lives in the component).
 */

export type ScannableItem = { id: string; code: string; sku?: string | null };

const PREFIX_TAG = /^(?:code|item|sku|id)\s*[:=]\s*/i;

/** Every string the raw scan could mean as an item code, best guess first. Never empty strings. */
export function scanCandidates(raw: string): string[] {
  const text = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };

  // JSON payload: {"code":"PPR-0012"} / {"itemCode":...} / {"sku":...}
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      for (const key of ['code', 'itemCode', 'item_code', 'sku', 'id']) push(parsed[key]);
    } catch {
      /* not JSON — fall through to the text forms */
    }
  }

  push(text);
  push(text.replace(PREFIX_TAG, ''));

  // A URL: the last path segment, or a ?code= / ?item= / ?sku= parameter.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      for (const key of ['code', 'item', 'itemCode', 'sku']) push(url.searchParams.get(key));
      const last = url.pathname.split('/').filter(Boolean).pop();
      if (last) push(decodeURIComponent(last));
    } catch {
      /* malformed URL — the plain forms above still apply */
    }
  }
  return out;
}

/** The item a scan resolves to, or null. Exact (case-insensitive) match on code, then SKU; never a fuzzy match. */
export function matchScannedItem<T extends ScannableItem>(items: readonly T[], raw: string): T | null {
  for (const candidate of scanCandidates(raw)) {
    const c = candidate.toLowerCase();
    const byCode = items.find((i) => i.code.toLowerCase() === c);
    if (byCode) return byCode;
    const bySku = items.find((i) => (i.sku ?? '').toLowerCase() === c && c !== '');
    if (bySku) return bySku;
  }
  return null;
}

/**
 * The sentence shown when the camera cannot scan. Takes the DOMException / Error `name`, never the browser's own
 * wording, and always ends by pointing at typing — scanning is a convenience, never a requirement.
 */
export function scanErrorMessage(errorName: string | null | undefined): string {
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'The camera is blocked. Allow camera access for this site in the browser settings, or type the code instead.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device. Type the code instead.';
    case 'NotReadableError':
      return 'The camera is being used by another app. Close it and try again, or type the code instead.';
    case 'Unsupported':
      return 'This browser cannot scan with the camera. Type the code instead.';
    default:
      return 'The camera could not start. Type the code instead.';
  }
}

/** What the cart says after a scan: the item added, or the raw text left in the search box so it can be typed on. */
export function scanOutcome<T extends ScannableItem & { name: string }>(items: readonly T[], raw: string): { item: T | null; message: string; fallbackQuery: string } {
  const item = matchScannedItem(items, raw);
  const cleaned = scanCandidates(raw)[0] ?? '';
  return item
    ? { item, message: `Scanned ${item.name}`, fallbackQuery: '' }
    : { item: null, message: `Nothing matches "${cleaned || raw.trim()}". It is in the search box — correct it and tap the item.`, fallbackQuery: cleaned };
}
