/**
 * The logic behind D13's document library.
 *
 * What the records actually hold is a `MisDocument`: a NAME and a LINK (a pasted storage URL or path — the MIS does
 * not hold the file), attached to exactly one order, with an optional size, type and description, who added it and
 * when. Everything below is derived from that and nothing else:
 *
 * - **Nothing floats.** `orderId` is required and the order cascades, so every file is attached to an order. That is
 *   a fact about the schema, stated in words — not a "Unlinked 0" count that looks measured.
 * - **The two kinds are not separable yet.** The artboard groups GENERATED (job cards, COAs…) apart from UPLOADED
 *   ones. A generated document here is a print page, never a stored row, and a stored row has no category, version,
 *   retention or "superseded by" — so those are not drawn, and the screen says what a row cannot tell you (F-23).
 *   The groups that CAN be drawn honestly are by file type (`mimeType`), which is recorded.
 * - **A link is only a link if it is safe to follow.** The link is a pasted string; `javascript:` or `data:` must
 *   never become an `href`. Only an absolute http(s) URL or a site path is followed; anything else is shown as text.
 * - **Money:** a document carries no price or wage. No money key is read or returned.
 *
 * Pure: no Prisma, no React.
 */

export const DOC_GROUPS = ['all', 'pdf', 'image', 'other', 'untyped', 'month'] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

export const DOC_PAGE_SIZE = 50;
export const MAX_QUERY = 60;
export const MAX_NAME = 200;
export const MAX_DESCRIPTION = 500;
export const MAX_LINK = 1000;

export type MimeFamily = 'pdf' | 'image' | 'other' | 'untyped';

/** A file's type family, from the recorded MIME type. No MIME type recorded is `untyped`, never a guess from a name. */
export function mimeFamily(mimeType: string | null | undefined): MimeFamily {
  const m = (mimeType ?? '').trim().toLowerCase();
  if (m === '') return 'untyped';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('image/')) return 'image';
  return 'other';
}

/** `?group=` from the URL: one of the known groups, anything else is "all". */
export function parseGroup(raw: unknown): DocGroup {
  return (DOC_GROUPS as readonly string[]).includes(raw as string) ? (raw as DocGroup) : 'all';
}

/** `?page=` — a whole number, 1 or more; anything else is page 1. */
export function parsePage(raw: unknown): number {
  const n = typeof raw === 'string' && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return n >= 1 ? n : 1;
}

/** The search text: a string, trimmed, capped. Wildcard characters are harmless — the query is a `contains`. */
export function normaliseQuery(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_QUERY) : '';
}

/**
 * The address a link may be followed to, or null. An absolute `http:`/`https:` URL, or a path on this site
 * (`/…`, not the protocol-relative `//…`). `javascript:`, `data:`, `file:`, `vbscript:` and a bare `C:\…` are not.
 */
export function safeHref(filePath: string | null | undefined): string | null {
  const raw = (filePath ?? '').trim();
  // A control character or space anywhere is refused: a browser strips a tab or newline, so "/\t/evil.com" would
  // resolve as the protocol-relative "//evil.com" past the check below.
  if (raw === '' || raw.length > MAX_LINK || /[\u0000-\u0020\u007f]/.test(raw)) return null;
  if (raw.startsWith('/')) return raw.startsWith('//') || raw.includes('\\') ? null : raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

/** 318 KB, 1.9 MB, 2.4 GB. Null when no size was recorded — a missing size is not "0 B". */
export function sizeLabel(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export type TypeTally = { mimeType: string | null; count: number; bytes: number; sized: number };

export type LibraryTotals = {
  files: number;
  /** Bytes across the files that HAVE a recorded size — a floor, not the bucket. */
  recordedBytes: number;
  /** How many files have no recorded size, so `recordedBytes` is read for what it is. */
  unsized: number;
  byGroup: Record<'pdf' | 'image' | 'other' | 'untyped', number>;
};

/** Totals from one grouped count. `sized` counts rows with a size; the rest are `unsized`. */
export function totalsFrom(tallies: readonly TypeTally[]): LibraryTotals {
  const totals: LibraryTotals = { files: 0, recordedBytes: 0, unsized: 0, byGroup: { pdf: 0, image: 0, other: 0, untyped: 0 } };
  for (const t of tallies) {
    totals.files += t.count;
    totals.recordedBytes += t.bytes;
    totals.unsized += t.count - t.sized;
    totals.byGroup[mimeFamily(t.mimeType)] += t.count;
  }
  return totals;
}

export type DocRowView = {
  id: string;
  name: string;
  orderId: string;
  orderNumber: string;
  orderDescription: string | null;
  family: MimeFamily;
  /** `dd/mm/yyyy` in the factory's zone (D22). */
  addedLabel: string;
  addedIso: string;
  size: string | null;
  description: string | null;
};

export type DocDetailView = DocRowView & {
  /** The recorded link as typed — shown as text. */
  link: string;
  /** Where "Open" goes, or null when the link is not safe to follow. */
  href: string | null;
  mimeType: string | null;
  /** `dd/mm/yyyy hh:mm` in the factory's zone. */
  addedFull: string;
  /** Who added it, or null when nobody is recorded or the profile is gone. */
  addedBy: string | null;
};

export type OrderOption = { id: string; label: string };

export type DocLibraryView = {
  query: string;
  group: DocGroup;
  page: number;
  pageCount: number;
  totals: LibraryTotals;
  monthCount: number;
  /** Files matching the search and group — `rows` is one page of them, newest first. */
  matching: number;
  rows: DocRowView[];
  selected: DocDetailView | null;
  canWrite: boolean;
  /** Present only while the add form is open (and only for a role that may add). */
  add: { orders: OrderOption[] } | null;
  notice: 'added' | null;
};

export const EMPTY_LIBRARY = (over: Partial<DocLibraryView> = {}): DocLibraryView => ({
  query: '', group: 'all', page: 1, pageCount: 1,
  totals: { files: 0, recordedBytes: 0, unsized: 0, byGroup: { pdf: 0, image: 0, other: 0, untyped: 0 } },
  monthCount: 0, matching: 0, rows: [], selected: null, canWrite: false, add: null, notice: null,
  ...over,
});

/** The message an add earns, or null. Order first, then name, then link. */
export function validateDocumentInput(input: { orderId: string; name: string; description?: string; link: string }): string | null {
  if (input.orderId.trim() === '') return 'Choose the order this file belongs to.';
  const name = input.name.trim();
  if (name === '') return 'A document needs a name.';
  if (name.length > MAX_NAME) return `A name is at most ${MAX_NAME} characters.`;
  if ((input.description ?? '').trim().length > MAX_DESCRIPTION) return `A description is at most ${MAX_DESCRIPTION} characters.`;
  if (input.link.trim() === '') return 'A document needs a link to its file.';
  if (safeHref(input.link) === null) return 'The link must be a full http(s) address or a path starting with /.';
  return null;
}
