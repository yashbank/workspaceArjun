'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/toast';
import {
  formatActivityLine,
  getAuditActionColor,
  ACTIVITY_ACTION_GROUPS,
} from '@/lib/audit-display';
import { getUserDisplayName } from '@/lib/user-display';
import { localDateInputValue } from '@/lib/activity-dates';
import {
  Activity,
  ArrowLeft,
  Loader2,
  Search,
  Star,
  Filter,
  Calendar,
  Trash2,
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

function defaultFromLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return localDateInputValue(d);
}

function getClientTzOffset(): number {
  return new Date().getTimezoneOffset();
}

export function ActivityBrowser({ isOwner }: { isOwner?: boolean }) {
  const { toast } = useToast();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);

  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState(defaultFromLocal);
  const [to, setTo] = useState(() => localDateInputValue());
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

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
      params.set('tzOffset', String(getClientTzOffset()));
      if (q) params.set('q', q);
      if (starredOnly) params.set('starredOnly', 'true');
      params.set('page', String(page));
      params.set('_', String(Date.now()));

      const data = await apiFetch<{
        events: ActivityEvent[];
        actors: Actor[];
        total: number;
        pageSize: number;
      }>(`/api/activity?${params.toString()}`);
      setEvents(data.events);
      setActors(data.actors);
      setTotal(data.total ?? data.events.length);
      setPageSize(data.pageSize ?? 50);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [actorId, action, targetType, from, to, q, starredOnly, page]);

  // Any filter change resets to the first page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging when filters change
    setPage(1);
  }, [actorId, action, targetType, from, to, q, starredOnly]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount / filter change
    void load();
  }, [load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  function toggleStar(event: ActivityEvent) {
    const nextStarred = !event.starred;
    const prevEvents = events;

    setEvents((prev) => {
      if (starredOnly && !nextStarred) {
        return prev.filter((e) => e.id !== event.id);
      }
      return prev.map((e) => (e.id === event.id ? { ...e, starred: nextStarred } : e));
    });

    const method = nextStarred ? 'POST' : 'DELETE';
    void apiFetch(`/api/activity/${event.id}/star`, { method }).catch(() => {
      setEvents(prevEvents);
      toast('error', 'Could not update star. Try again.');
    });
  }

  async function deleteEvent(event: ActivityEvent) {
    const prevEvents = events;
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setTotal((t) => Math.max(0, t - 1));
    try {
      await apiFetch(`/api/activity/${event.id}`, { method: 'DELETE' });
    } catch (e) {
      setEvents(prevEvents);
      setTotal((t) => t + 1);
      toast('error', e instanceof Error ? e.message : 'Could not delete activity');
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQ(searchInput.trim());
  }

  async function handleClearHistory() {
    setClearBusy(true);
    try {
      await apiFetch('/api/activity/clear', { method: 'POST' });
      setClearOpen(false);
      setEvents([]);
      setActors([]);
      toast('success', 'Activity history cleared');
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
            Newest first · last 30 days · same feed as dashboard recent activity
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/25 px-3 py-2 text-xs font-medium text-destructive transition-all hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear history
          </button>
        )}
      </div>

      <div className="bpp-card space-y-3.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground/70">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/45">
            <Calendar className="h-3 w-3" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border/45 bg-background px-2 py-1"
              aria-label="From date"
            />
            <span>–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border/45 bg-background px-2 py-1"
              aria-label="To date"
            />
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search user, file, or folder…"
            className="w-full rounded-xl border border-border/50 bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
          />
        </form>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="min-w-0 rounded-xl border border-border/50 bg-background px-2.5 py-2 text-xs"
            aria-label="Filter by user"
          >
            <option value="">All users</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {getUserDisplayName(a)}
              </option>
            ))}
          </select>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="min-w-0 rounded-xl border border-border/50 bg-background px-2.5 py-2 text-xs"
            aria-label="Filter by action"
          >
            {ACTIVITY_ACTION_GROUPS.map((g) => (
              <option key={g.value || 'all'} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="min-w-0 rounded-xl border border-border/50 bg-background px-2.5 py-2 text-xs"
            aria-label="Filter by target"
          >
            <option value="">All targets</option>
            <option value="file">Files</option>
            <option value="folder">Folders</option>
            <option value="user">Users</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/50 bg-background px-2.5 py-2 text-xs">
            <input
              type="checkbox"
              checked={starredOnly}
              onChange={(e) => setStarredOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-primary"
            />
            Starred
          </label>
        </div>

        {q && (
          <button
            type="button"
            onClick={() => {
              setQ('');
              setSearchInput('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear search
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="bpp-card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-border/30">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="h-8 w-8 shrink-0 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-4/5 max-w-md rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                  <div className="h-2.5 w-24 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/20" />
            <p className="mt-4 text-sm font-semibold text-muted-foreground/55">No activity found</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground/45">
              Uploads, folder changes, and restores appear here for owners and admins.
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
                  <p className="text-[13px] leading-snug break-words">
                    {formatActivityLine(event.actor, event.action, event.meta)}
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
                  onClick={() => toggleStar(event)}
                  className={`shrink-0 rounded-lg p-2 transition-all hover:bg-accent ${
                    event.starred ? 'text-amber-500' : 'text-muted-foreground/35'
                  }`}
                  title={event.starred ? 'Unstar' : 'Star'}
                >
                  <Star className={`h-4 w-4 ${event.starred ? 'fill-current' : ''}`} />
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => void deleteEvent(event)}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground/30 transition-all hover:bg-destructive/10 hover:text-destructive"
                    title="Delete activity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] tabular-nums text-muted-foreground/45">
            {total.toLocaleString()} event{total === 1 ? '' : 's'} · page {page} of{' '}
            {Math.max(1, Math.ceil(total / pageSize))}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= Math.ceil(total / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {clearOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-md rounded-2xl border border-border/55 bg-card p-6 shadow-float">
            <h2 className="text-lg font-semibold">Clear all activity?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This permanently deletes every audit event and starred pin. For demo resets only.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearBusy}
                onClick={() => void handleClearHistory()}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {clearBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
