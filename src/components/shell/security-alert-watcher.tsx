'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type AlertPayload = {
  actorName?: string | null;
  actorEmail?: string;
  actorRole?: string;
  ip?: string | null;
  mode?: string;
  deviceStatus?: string;
  userAgent?: string | null;
  enforced?: boolean;
  at?: string;
};
type Alert = { id: string; payload: AlertPayload };

/**
 * Owner-only. Surfaces blocked-access attempts as an urgent red modal the
 * instant they happen (Supabase Realtime), and also on mount / tab focus so a
 * missed alert still shows. Notifications are durable rows, so nothing is lost
 * if the Owner was away. Dismissing marks the alert read.
 */
export function SecurityAlertWatcher({ ownerId }: { ownerId: string }) {
  const [queue, setQueue] = useState<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());

  const enqueue = useCallback((items: Alert[]) => {
    setQueue((prev) => {
      const next = [...prev];
      for (const a of items) {
        if (!seen.current.has(a.id)) {
          seen.current.add(a.id);
          next.push(a);
        }
      }
      return next;
    });
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: { id: string; payload: unknown; readAt: string | null }[];
      };
      const items = (data.items ?? [])
        .filter((n) => !n.readAt)
        .map((n) => ({ id: n.id, payload: (n.payload as AlertPayload) ?? {} }));
      enqueue(items);
    } catch {
      /* ignore */
    }
  }, [enqueue]);

  useEffect(() => {
    void loadUnread();

    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUnread();
    };
    document.addEventListener('visibilitychange', onVis);

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('security-alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new as { id?: string; type?: string; payload?: unknown };
          if (row?.id && typeof row.type === 'string' && row.type.startsWith('security.')) {
            enqueue([{ id: row.id, payload: (row.payload as AlertPayload) ?? {} }]);
          }
        },
      )
      .subscribe();

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void supabase.removeChannel(channel);
    };
  }, [ownerId, loadUnread, enqueue]);

  const current = queue[0];

  const dismiss = useCallback(async () => {
    if (!current) return;
    const id = current.id;
    setQueue((prev) => prev.slice(1));
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      /* ignore */
    }
  }, [current]);

  if (!current) return null;

  const p = current.payload;
  const who = p.actorName?.trim() || p.actorEmail || 'A restricted user';
  const factor =
    p.mode && p.mode.includes('device') && p.deviceStatus !== 'approved'
      ? 'an unapproved device'
      : 'an unapproved network/IP';

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 duration-150"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="animate-in scale-in fade-in w-full max-w-md overflow-hidden rounded-2xl border border-destructive/30 bg-card shadow-float duration-200">
        <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive/8 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold tracking-tight text-destructive">
              Security alert — sign-in blocked
            </h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-foreground/80">
              <span className="font-semibold">{who}</span> tried to access the workspace from {factor}.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5 px-5 py-4 text-[13px]">
          <Row label="User" value={p.actorEmail ?? who} />
          {p.actorRole && <Row label="Role" value={p.actorRole} />}
          <Row label="IP address" value={p.ip ?? 'unknown'} mono />
          <Row label="Policy" value={p.mode ?? '—'} />
          <Row label="Device" value={p.deviceStatus ?? '—'} />
          <Row label="When" value={p.at ? new Date(p.at).toLocaleString() : 'just now'} />
          <Row label="Status" value={p.enforced ? 'Blocked' : 'Recorded (enforcement off)'} />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/30 px-5 py-3.5">
          <a
            href="/admin/security"
            className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Open Security
          </a>
          <button
            onClick={dismiss}
            className="shadow-card hover:shadow-elevated rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-white transition-shadow"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground/60">{label}</span>
      <span className={`min-w-0 truncate text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
