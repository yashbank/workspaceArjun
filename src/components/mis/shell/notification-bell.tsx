'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isMisNotifyRole, notificationView, type NotificationView } from '@/lib/mis/notification-copy';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Item = NotificationView & { id: string };

/**
 * V2 — the live bell. Rendered only for OWNER / ADMIN / STORE_GUY; every other role gets
 * `null` and no subscription. New rows arrive over Supabase Realtime (the same channel pattern
 * as the Owner's security watcher) and also on mount / tab focus, so nothing is missed offline.
 * A new arrival also flashes a toast for a few seconds.
 */
export function NotificationBell({ userId, role }: { userId: string; role: string | null }) {
  const enabled = isMisNotifyRole(role);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Item | null>(null);
  const seen = useRef(new Set<string>());
  const toastTimer = useRef<number | null>(null);

  const add = useCallback((rows: { id: string; type: string; payload: unknown }[], flash: boolean) => {
    const fresh = rows
      .filter((r) => !seen.current.has(r.id))
      .map((r) => {
        const view = notificationView(r.type, r.payload);
        return view ? { id: r.id, ...view } : null;
      })
      .filter((x): x is Item => x !== null);
    if (fresh.length === 0) return;
    for (const f of fresh) seen.current.add(f.id);
    setItems((prev) => [...fresh, ...prev]);
    if (flash) {
      setToast(fresh[0]);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 6000);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mis/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: { id: string; type: string; payload: unknown }[] };
      add(data.items ?? [], false);
    } catch {
      /* offline: the next focus retries */
    }
  }, [add]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const onVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVis);
    // Live push is a bonus on top of the load-on-focus above: without a Supabase client (no
    // public env in a test, or a misconfigured deploy) the bell still fills on every focus.
    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try { supabase = createSupabaseBrowserClient(); } catch { supabase = null; }
    const channel = supabase
      ?.channel(`mis-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as { id?: string; type?: string; payload?: unknown };
        if (row?.id && typeof row.type === 'string' && row.type.startsWith('mis.')) add([{ id: row.id, type: row.type, payload: row.payload }], true);
      })
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [enabled, userId, load, add]);

  const dismiss = useCallback(async (ids: string[]) => {
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setToast((t) => (t && ids.includes(t.id) ? null : t));
    try {
      await fetch('/api/mis/notifications/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    } catch {
      /* the row stays unread server-side and comes back on the next load */
    }
  }, []);

  if (!enabled) return null;

  const DOT = { info: 'bg-indigo-500', risk: 'bg-amber-500', ok: 'bg-green-500' } as const;

  return (
    <div className="relative">
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
              <button type="button" className="min-h-11 text-xs text-slate-500 underline" onClick={() => void dismiss(items.map((i) => i.id))}>
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
                  <Link href={n.href} onClick={() => { setOpen(false); void dismiss([n.id]); }} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{n.title}</span>
                    <span className="block text-xs text-slate-500">{n.detail}</span>
                  </Link>
                  <button type="button" aria-label="Dismiss" className="min-h-11 min-w-11 text-slate-400" onClick={() => void dismiss([n.id])}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 top-16 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-3 shadow-lg lg:inset-x-auto lg:right-6 lg:top-16">
          <Link href={toast.href} onClick={() => void dismiss([toast.id])} className="flex gap-2">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[toast.tone])} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{toast.title}</span>
              <span className="block text-xs text-slate-500">{toast.detail}</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
