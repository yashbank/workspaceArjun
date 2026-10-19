import Link from 'next/link';

import { PAGE_SIZE, clampPage, pageCount, pageHref, pageWindow, rangeLabel } from '@/lib/mis/pagination';

type Params = Record<string, string | string[] | undefined | null>;

type Props = {
  /** The list's own path, e.g. `/mis/po`. */
  basePath: string;
  /** The current URL params (search, filters, page) — every one except `page` is kept in the links. */
  params: Params;
  page: number;
  total: number;
  pageSize?: number;
};

const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold';

/** R2-83: the footer under a server-paged list — total, prev / next and page numbers; plain links so it works server-side. */
export function Pagination({ basePath, params, page, total, pageSize = PAGE_SIZE }: Props) {
  const pages = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  const href = (p: number) => pageHref(basePath, params, p);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 py-2">
      <p className="text-sm text-slate-700" data-testid="pagination-range">{rangeLabel(current, total, pageSize)}</p>
      {pages > 1 && (
        <ul className="flex flex-wrap items-center gap-1">
          <li>
            {current > 1 ? (
              <Link href={href(current - 1)} rel="prev" className={`${BTN} border-slate-300 bg-white text-slate-900 hover:bg-slate-50`}>Previous</Link>
            ) : (
              <span aria-disabled="true" className={`${BTN} border-slate-200 bg-slate-50 text-slate-400`}>Previous</span>
            )}
          </li>
          {pageWindow(current, pages).map((p, i) =>
            p === '…' ? (
              <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-slate-500">…</li>
            ) : (
              <li key={p}>
                <Link
                  href={href(p)}
                  aria-current={p === current ? 'page' : undefined}
                  className={`${BTN} ${p === current ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'}`}
                >
                  {p}
                </Link>
              </li>
            ),
          )}
          <li>
            {current < pages ? (
              <Link href={href(current + 1)} rel="next" className={`${BTN} border-slate-300 bg-white text-slate-900 hover:bg-slate-50`}>Next</Link>
            ) : (
              <span aria-disabled="true" className={`${BTN} border-slate-200 bg-slate-50 text-slate-400`}>Next</span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}

/** Hidden inputs that carry the current filters through a GET search form (so searching keeps them, and drops `page`). */
export function HiddenParams({ params, omit = ['q', 'page'] }: { params: Params; omit?: string[] }) {
  return (
    <>
      {Object.entries(params).flatMap(([k, v]) => {
        const val = Array.isArray(v) ? v[0] : v;
        return omit.includes(k) || !val ? [] : [<input key={k} type="hidden" name={k} value={val} />];
      })}
    </>
  );
}
