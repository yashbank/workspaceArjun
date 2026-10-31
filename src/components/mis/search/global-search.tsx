'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { searchMisAction } from '@/app/(mis)/mis/search/actions';
import type { MisSearchResult } from '@/server/mis/search';
import { useT } from '../shell/locale-provider';

/** Long enough that a factory connection on a shared 3G link is not sending one request per
 * keystroke, short enough that the result still feels live. */
const DEBOUNCE_MS = 250;

/** R2-146: group order in the dropdown. */
const GROUPS: { type: MisSearchResult['type']; label: string }[] = [
  { type: 'order', label: 'Orders' },
  { type: 'machine', label: 'Machines' },
  { type: 'item', label: 'Items' },
  { type: 'po', label: 'Purchase Orders' },
  { type: 'grn', label: 'GRNs' },
  { type: 'employee', label: 'Employees' },
];

const noopSubscribe = () => () => {};

const RECENT_KEY = 'mis-recent-searches';
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function writeRecent(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, RECENT_MAX)));
  } catch {
    /* storage blocked: recent searches are a convenience only */
  }
}

/**
 * R2-144/145/148 — one search box, used by both the desktop header and the mobile search sheet.
 * Debounced, routes on Enter or a click, Escape clears. The server does the filtering and the
 * RBAC (`searchMisAction` → `searchMisEntities`); this component only renders what comes back.
 */
export function GlobalSearch({ autoFocus = false, onNavigate, shortcuts = false }: { autoFocus?: boolean; onNavigate?: () => void; /** R2-147: register Ctrl/Cmd+K and "/" to focus this box (one instance per page). */ shortcuts?: boolean }) {
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
  const seq = useRef(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const mac = useSyncExternalStore(noopSubscribe, () => /Mac|iPhone|iPad/i.test(navigator.platform ?? ''), () => false);

  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcuts]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim().slice(0, 100);
    seq.current += 1;
    timer.current = setTimeout(async () => {
      if (q.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const mine = ++seq.current;
      const res = await searchMisAction(q);
      if (mine !== seq.current) return;
      const rank = (t: MisSearchResult['type']) => GROUPS.findIndex((g) => g.type === t);
      setResults(res.ok ? [...res.value].sort((a, b) => rank(a.type) - rank(b.type)) : []);
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
    if (query.trim().length >= 2) writeRecent(query.trim().slice(0, 100));
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
          maxLength={100}
          onFocus={() => { setOpen(true); setFocused(true); setRecent(readRecent()); }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        {shortcuts && !focused && query === '' && (
          <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-500 sm:block">
            {mac ? '⌘K' : 'Ctrl K'}
          </kbd>
        )}
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
      {open && query.trim() === '' && recent.length > 0 && (
        <ul id="mis-global-search-list" role="listbox" aria-label="Recent searches" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          <li role="presentation" className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</li>
          {recent.map((r) => (
            <li key={r} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); setQuery(r); inputRef.current?.focus(); }} className="flex min-h-11 w-full items-center px-4 text-left text-sm text-slate-800 hover:bg-slate-50">
                {r}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim().length >= 2 && (
        <ul
          id="mis-global-search-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {loading && (
            <li role="status" className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
              <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
              Searching…
            </li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-600">No matches found for &quot;{query.trim().slice(0, 100)}&quot;</li>
          )}
          {!loading && GROUPS.map((g) => {
            const inGroup = results.map((r, i) => ({ r, i })).filter(({ r }) => r.type === g.type);
            if (inGroup.length === 0) return null;
            return [
              <li key={`h-${g.type}`} role="presentation" className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</li>,
              ...inGroup.map(({ r, i }) => (
                <li key={`${r.type}-${r.id}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); go(r); }}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-slate-900">{r.title}</span>
                      {r.subtitle && <span className="ml-2 text-slate-500">{r.subtitle}</span>}
                    </span>
                    {r.status && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{r.status.replace(/_/g, ' ')}</span>}
                  </button>
                </li>
              )),
            ];
          })}
        </ul>
      )}
    </div>
  );
}
