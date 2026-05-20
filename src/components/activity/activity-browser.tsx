'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  formatActivityLine,
  getAuditActionColor,
  ACTIVITY_ACTION_GROUPS,
} from '@/lib/audit-display';
import {
  Activity,
  ArrowLeft,
  Loader2,
  Search,
  Star,
  Filter,
  Calendar,
} from 'lucide-react';

type ActivityEvent = {
  id: string;
  action: string;
  targetType: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
  actor: { id: string; email: string; name: string | null } | null;
  starred: boolean;
};

type Actor = { id: string; email: string; name: string | null };

function defaultFromIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ActivityBrowser() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState(defaultFromIso);
  const [to, setTo] = useState(todayIso);
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [busyStar, setBusyStar] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (actorId) params.set('actorId', actorId);
      if (action) params.set('action', action);
      if (targetType) params.set('targetType', targetType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (q) params.set('q', q);
      if (starredOnly) params.set('starredOnly', 'true');

      const data = await apiFetch<{ events: ActivityEvent[]; actors: Actor[] }>(
        `/api/activity?${params.toString()}`,
      );
      setEvents(data.events);
      setActors(data.actors);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [actorId, action, targetType, from, to, q, starredOnly]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount / filter change
    void load();
  }, [load]);

  async function toggleStar(event: ActivityEvent) {
    setBusyStar(event.id);
    try {
      if (event.starred) {
        await apiFetch(`/api/activity/${event.id}/star`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/activity/${event.id}/star`, { method: 'POST' });
      }
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, starred: !e.starred } : e)),
      );
      if (starredOnly && event.starred) {
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
      }
    } catch {
      // ignore
    } finally {
      setBusyStar(null);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQ(searchInput.trim());
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Link>
          <h1 className="bpp-page-title">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace actions from the last 30 days. Star events to pin them for quick reference.
          </p>
        </div>
      </div>

      <div className="bpp-card space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>

        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by user, file, or folder name…"
            className="w-full rounded-xl border border-border/50 bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
          />
        </form>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45">
            User
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
            >
              <option value="">All users</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45">
            Action
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
            >
              {ACTIVITY_ACTION_GROUPS.map((g) => (
                <option key={g.value || 'all'} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45">
            Target
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
            >
              <option value="">All</option>
              <option value="file">Files</option>
              <option value="folder">Folders</option>
              <option value="user">Users</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-end gap-2 pb-2 text-xs">
            <input
              type="checkbox"
              checked={starredOnly}
              onChange={(e) => setStarredOnly(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="font-medium">Starred only</span>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> From
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground/45">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 rounded-xl border border-border/50 bg-background px-3 py-2 text-xs"
            />
          </label>
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setSearchInput('');
              }}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              Clear search
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="bpp-card overflow-hidden">
        {loading ? (
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-4/5 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                  <div className="h-2.5 w-1/3 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/20" />
            <p className="mt-4 text-sm font-semibold text-muted-foreground/55">No activity found</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground/45">
              Try adjusting filters or date range. Member uploads and folder actions appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/35">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-accent/10 sm:items-center"
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:mt-0 ${getAuditActionColor(event.action)}`}
                >
                  <Activity className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">
                    <span className="font-medium text-foreground">
                      {formatActivityLine(event.actor, event.action, event.meta)}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/45">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.targetType && (
                      <span className="ml-2 rounded bg-muted/40 px-1.5 py-0.5 uppercase tracking-wide">
                        {event.targetType}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyStar === event.id}
                  onClick={() => void toggleStar(event)}
                  className={`shrink-0 rounded-lg p-2 transition-all hover:bg-accent ${
                    event.starred ? 'text-amber-500' : 'text-muted-foreground/35'
                  }`}
                  title={event.starred ? 'Unstar' : 'Star'}
                >
                  {busyStar === event.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Star className={`h-4 w-4 ${event.starred ? 'fill-current' : ''}`} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && events.length > 0 && (
        <p className="text-center text-[11px] text-muted-foreground/40">
          Showing up to {events.length} events (last 30 days max)
        </p>
      )}
    </div>
  );
}
