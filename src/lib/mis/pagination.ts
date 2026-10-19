/**
 * R2-83: server-side pagination for the MIS lists. Pure — no db, no React — so the rule is testable
 * and every list pages the same way: 25 rows a page, the page number and the search / filters live
 * in the URL, so a refresh or a shared link lands on the same rows.
 */

export const PAGE_SIZE = 25;

/** What a list function returns: one page of rows and the count of ALL rows matching the filters. */
export type Paged<T> = { rows: T[]; total: number };

export type PageQuery = { page: number; pageSize: number; skip: number; take: number };

/** No list is anywhere near 250,000 rows; a larger `?page=` is a typo or a probe, never a real page. */
export const MAX_PAGE = 10_000;

/** `?page=` as typed: anything that is not a whole number >= 1 is page 1; it is capped at MAX_PAGE so the OFFSET stays sane. */
export function parsePage(raw: string | string[] | number | null | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_PAGE) : 1;
}

export function pageCount(total: number, pageSize: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** The page clamped into 1..last, so `?page=999` shows the last page rather than an empty list. */
export function clampPage(page: number, total: number, pageSize: number = PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, pageSize));
}

/** skip/take for Prisma from a raw `?page=` value. */
export function pageQuery(raw: string | string[] | number | null | undefined, pageSize: number = PAGE_SIZE): PageQuery {
  const page = parsePage(raw);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** The `?q=` search text: trimmed, one value, capped so a pasted essay cannot become a query. */
export function parseSearch(raw: string | string[] | null | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v ?? '').trim().slice(0, 100);
}

/** "1-25 of 130" — `0 of 0` for an empty list. */
export function rangeLabel(page: number, total: number, pageSize: number = PAGE_SIZE): string {
  if (total <= 0) return '0 of 0';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return `${from}-${to} of ${total}`;
}

/** Page numbers to show: first, last, and two either side of the current page, with '…' for gaps. */
export function pageWindow(page: number, pages: number): (number | '…')[] {
  const wanted = new Set<number>([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

type Params = Record<string, string | string[] | undefined | null>;

/** The URL for `page` with every other param kept; page 1 carries no `page` param. */
export function pageHref(basePath: string, params: Params, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === 'page') continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== null && val !== '') qs.set(k, val);
  }
  if (page > 1) qs.set('page', String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}
