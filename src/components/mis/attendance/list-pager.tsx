'use client';

import { useEffect, useState } from 'react';

import { PAGE_SIZE, clampPage, pageCount, rangeLabel } from '@/lib/mis/pagination';

/** R2-83: page a client-held list 25 at a time. Resets to page 1 when `resetKey` (the filters) changes. */
export function usePagedRows<T>(rows: T[], resetKey: string): { pageRows: T[]; page: number; total: number; setPage: (p: number) => void } {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const current = clampPage(page, rows.length);
  return { pageRows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), page: current, total: rows.length, setPage };
}

const BTN = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400';

/** Previous / next footer for {@link usePagedRows}; hidden when everything fits on one page. */
export function ListPager({ page, total, setPage }: { page: number; total: number; setPage: (p: number) => void }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 py-2">
      <p className="text-sm text-slate-700" data-testid="pagination-range">{rangeLabel(page, total)}</p>
      <div className="flex items-center gap-1">
        <button type="button" className={BTN} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="px-2 text-sm text-slate-700">Page {page} of {pages}</span>
        <button type="button" className={BTN} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
