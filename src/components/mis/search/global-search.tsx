'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { searchMisAction } from '@/app/(mis)/mis/search/actions';
import type { MisSearchResult } from '@/server/mis/search';
import { useT } from '../shell/locale-provider';

/** Long enough that a factory connection on a shared 3G link is not sending one request per
 * keystroke, short enough that the result still feels live. */
const DEBOUNCE_MS = 250;

const TYPE_LABEL: Record<MisSearchResult['type'], string> = {
  order: 'Order',
  machine: 'Machine',
  item: 'Item',
  po: 'Purchase Order',
  grn: 'GRN',
  employee: 'Employee',
};

/**
 * R2-144/145/148 — one search box, used by both the desktop header and the mobile search sheet.
 * Debounced, routes on Enter or a click, Escape clears. The server does the filtering and the
 * RBAC (`searchMisAction` → `searchMisEntities`); this component only renders what comes back.
 */
export function GlobalSearch({ autoFocus = false, onNavigate }: { autoFocus?: boolean; onNavigate?: () => void }) {
  const t = useT();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MisSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    timer.current = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await searchMisAction(q);
      setResults(res.ok ? res.value : []);
      setLoading(false);
      setActive(0);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const go = (r: MisSearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    onNavigate?.();
    router.push(r.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
      setResults([]);
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <label className="relative block">
        <span className="sr-only">{t('desk.search')}</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="mis-global-search-list"
          autoComplete="off"
          placeholder={t('desk.search')}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </label>
      {open && query.trim().length >= 2 && (
        <ul
          id="mis-global-search-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {loading && <li className="px-4 py-3 text-sm text-slate-500">Searching…</li>}
          {!loading && results.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No matches.</li>}
          {!loading && results.map((r, i) => (
            <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); go(r); }}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-900">{r.title}</span>
                  {r.subtitle && <span className="ml-2 text-slate-500">{r.subtitle}</span>}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{TYPE_LABEL[r.type]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
