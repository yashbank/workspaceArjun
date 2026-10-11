'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useToast } from '@/components/ui/toast';
import { isMisNotifyRole, notificationView, type NotificationView } from '@/lib/mis/notification-copy';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Item = NotificationView & { id: string };
type Store = { enabled: boolean; items: Item[]; dismiss: (ids: string[]) => void };

const Ctx = createContext<Store>({ enabled: false, items: [], dismiss: () => {} });

/**
 * V2 — the live bell's ONE state. Mounted once in the MIS shell; the two chromes (desktop top
 * bar, phone header) each render a `NotificationBell` button from it, so one fetch, one Realtime
 * channel, and a dismiss on either layout is a dismiss on both.
 *
 * Only OWNER / ADMIN / STORE_GUY are enabled; every other role gets no fetch and no channel.
 * Rows arrive over Supabase Realtime (the Owner's security watcher's pattern) and on mount / tab
 * focus; a live arrival also goes through the app's shared toast.
 */
export function NotificationProvider({ userId, role, children }: { userId: string; role: string | null; children: ReactNode }) {
  const enabled = isMisNotifyRole(role);
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const pending = useRef(new Set<string>()); // dismissed locally, mark-read still in flight

  const toViews = (rows: { id: string; type: string; payload: unknown }[]): Item[] =>
    rows
      .map((r) => {
        const view = notificationView(r.type, r.payload);
        return view ? { id: r.id, ...view } : null;
      })
      .filter((x): x is Item => x !== null);

  /** A live INSERT: prepend (once) and say so through the app's toast. */
  const addLive = useCallback(
    (row: { id: string; type: string; payload: unknown }) => {
      const [fresh] = toViews([row]);
      if (!fresh) return;
      setItems((prev) => (prev.some((i) => i.id === fresh.id) ? prev : [fresh, ...prev]));
      toast(fresh.tone === 'risk' ? 'error' : 'info', fresh.title);
    },
    [toast],
  );

  /** The server's unread list IS the list: a row read elsewhere (home card, another tab) drops out here too. */
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mis/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: { id: string; type: string; payload: unknown }[] };
      setItems(toViews(data.items ?? []).filter((i) => !pending.current.has(i.id)));
    } catch {
      /* offline: the next focus retries */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    // Live push is a bonus on top of load-on-focus: with no public Supabase env (a test, a
    // misconfigured deploy) the bell still fills on every focus.
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try { supabase = createSupabaseBrowserClient(); } catch { supabase = null; }
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let cancelled = false;
    void (async () => {
      if (!supabase) return;
      // The notifications table is behind RLS (user_id = auth.uid()). Realtime only delivers rows the
      // socket's OWN token may read, and the socket opens before the cookie session is loaded —
      // so hand it the session JWT first, or every INSERT is silently filtered out.
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      } catch {
        /* no session: the focus reload still works */
      }
      if (cancelled) return;
      channel = supabase
        .channel(`mis-notifications-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
          const row = payload.new as { id?: string; type?: string; payload?: unknown };
          if (row?.id && typeof row.type === 'string' && row.type.startsWith('mis.')) addLive({ id: row.id, type: row.type, payload: row.payload });
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, load, addLive]);

  const dismiss = useCallback(
    (ids: string[]) => {
      for (const id of ids) pending.current.add(id);
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      void (async () => {
        let ok = false;
        try {
          const res = await fetch('/api/mis/notifications/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
          ok = res.ok;
        } catch {
          ok = false;
        }
        for (const id of ids) pending.current.delete(id);
        // Not marked on the server (offline, expired session): bring the rows back rather than hide an unread row.
        if (!ok) void load();
      })();
    },
    [load],
  );

  return <Ctx.Provider value={{ enabled, items, dismiss }}>{children}</Ctx.Provider>;
}

const DOT = { info: 'bg-indigo-500', risk: 'bg-amber-500', ok: 'bg-green-500' } as const;

/** The button + dropdown. Renders nothing for a role the bell is not for. */
export function NotificationBell() {
  const { enabled, items, dismiss } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  if (!enabled) return null;

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-label={`Notifications${items.length ? `, ${items.length} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {items.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-2 w-[min(92vw,22rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {items.length > 0 && (
              <button type="button" className="min-h-11 text-xs text-slate-500 underline" onClick={() => dismiss(items.map((i) => i.id))}>
                Clear all
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500">Nothing new.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="flex gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[n.tone])} />
                  <Link href={n.href} onClick={() => { setOpen(false); dismiss([n.id]); }} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                    <span className="block text-xs text-slate-500">{n.detail}</span>
                  </Link>
                  <button type="button" aria-label="Dismiss" className="min-h-11 min-w-11 text-slate-400" onClick={() => dismiss([n.id])}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
