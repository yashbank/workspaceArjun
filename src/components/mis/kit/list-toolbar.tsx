'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { pageHref } from '@/lib/mis/pagination';

import { FilterBar } from './filter-bar';

type Params = Record<string, string | undefined>;

/** Returns `go(patch)`: navigate to the same list with some URL params changed, page reset to 1. The server re-queries, so search and filters are server-side. */
export function useListNav(basePath: string, params: Params) {
  // shortcut: a bare try/catch so a screen still renders without the app router (unit tests); falls back to a full navigation.
  let router: ReturnType<typeof useRouter> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- useRouter only reads one context, so the hook order is the same whether or not it throws
    router = useRouter();
  } catch {
    router = null;
  }
  return (patch: Params) => {
    const href = pageHref(basePath, { ...params, ...patch }, 1);
    if (router) router.replace(href);
    else window.location.assign(href);
  };
}

const TOGGLE = 'inline-flex size-12 items-center justify-center rounded-lg border';

/**
 * The one list toolbar (R8 T2): debounced search, filters beside it, optional card/row toggle,
 * all inside one card above the list. `children` receives `go` so a filter can set its own param.
 */
export function ListToolbar({
  basePath,
  params,
  searchLabel,
  view,
  showViewToggle = true,
  children,
}: {
  basePath: string;
  /** Current URL params (q, filters, view); `page` is dropped on every change. */
  params: Params;
  searchLabel: string;
  view?: 'cards' | 'rows';
  showViewToggle?: boolean;
  children?: (go: (patch: Params) => void) => ReactNode;
}) {
  const go = useListNav(basePath, params);
  const filtered = Object.entries(params).some(([k, v]) => k !== 'view' && Boolean(v));
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <FilterBar searchLabel={searchLabel} query={params.q ?? ''} onQuery={(q) => go({ q })}>
            {children?.(go)}
          </FilterBar>
        </div>
        {showViewToggle && (
          <div role="group" aria-label="List layout" className="flex shrink-0 gap-1">
            {([['cards', 'Cards', LayoutGrid], ['rows', 'Rows', Rows3]] as const).map(([v, label, Icon]) => (
              <Link
                key={v}
                href={pageHref(basePath, { ...params, view: v }, 1)}
                aria-label={`${label} view`}
                aria-current={view === v ? 'true' : undefined}
                className={cn(TOGGLE, view === v ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')}
              >
                <Icon aria-hidden="true" className="size-4" />
              </Link>
            ))}
          </div>
        )}
      </div>
      {filtered && (
        <Link href={pageHref(basePath, { view: params.view }, 1)} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-indigo-700 hover:underline">
          Clear filters
        </Link>
      )}
    </div>
  );
}
