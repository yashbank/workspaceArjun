'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Lock,
  Loader2,
  Trash2,
  Plus,
  ShieldAlert,
  Globe,
  User as UserIcon,
  Monitor,
  Info,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

type Role = 'owner' | 'admin' | 'member' | 'viewer';
type Mode = 'unrestricted' | 'ip' | 'device' | 'ip_and_device' | 'ip_or_device';

type OverviewUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: 'active' | 'deactivated';
  accessMode: Mode;
};
type IpRange = {
  id: string;
  userId: string | null;
  value: string;
  label: string | null;
  createdAt: string;
};
type Device = {
  id: string;
  userId: string | null;
  status: 'pending' | 'approved' | 'revoked';
  userAgent: string | null;
  browser: string | null;
  deviceLabel: string | null;
  lastIp: string | null;
  createdAt: string;
  approvedAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
};
type Denial = {
  id: string;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  meta: { mode?: string; reason?: string; deviceStatus?: string; enforced?: boolean } | null;
  actor: { id: string; email: string; name: string | null; role: Role } | null;
};
type Overview = { users: OverviewUser[]; ipRanges: IpRange[]; devices: Device[]; denials: Denial[] };

const MODES: { value: Mode; label: string }[] = [
  { value: 'unrestricted', label: 'Unrestricted' },
  { value: 'ip', label: 'Office IP only' },
  { value: 'device', label: 'Approved device only' },
  { value: 'ip_and_device', label: 'IP and device' },
  { value: 'ip_or_device', label: 'IP or device' },
];

function displayName(u: { name: string | null; email: string } | null): string {
  if (!u) return 'Unknown';
  return u.name?.trim() || u.email.split('@')[0];
}

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function roleBadge(role: Role): string {
  if (role === 'owner') return 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300';
  if (role === 'admin') return 'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300';
  return 'bg-muted/40 text-muted-foreground/70 ring-border/40';
}

export default function SecurityPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [addingIp, setAddingIp] = useState(false);
  const [ipValue, setIpValue] = useState('');
  const [ipLabel, setIpLabel] = useState('');
  const [ipScope, setIpScope] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await apiFetch<Overview>('/api/admin/security');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load security settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    load();
  }, [load]);

  const nameForUser = useCallback(
    (userId: string | null): string => {
      if (!userId) return 'Workspace-wide';
      const u = data?.users.find((x) => x.id === userId);
      return u ? displayName(u) : 'Unknown user';
    },
    [data],
  );

  async function updateMode(userId: string, accessMode: Mode) {
    setSavingUser(userId);
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessMode }),
      });
      setData((prev) =>
        prev
          ? { ...prev, users: prev.users.map((u) => (u.id === userId ? { ...u, accessMode } : u)) }
          : prev,
      );
      toast('success', 'Access mode updated');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update access mode');
    } finally {
      setSavingUser(null);
    }
  }

  async function addIp(e: React.FormEvent) {
    e.preventDefault();
    if (!ipValue.trim()) {
      toast('error', 'Enter an IP address or CIDR range');
      return;
    }
    setAddingIp(true);
    try {
      await apiFetch('/api/admin/security/ip-ranges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: ipValue.trim(),
          label: ipLabel.trim() || undefined,
          userId: ipScope || null,
        }),
      });
      setIpValue('');
      setIpLabel('');
      setIpScope('');
      toast('success', 'IP range added');
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not add IP range');
    } finally {
      setAddingIp(false);
    }
  }

  async function deleteIp(id: string) {
    try {
      await apiFetch(`/api/admin/security/ip-ranges/${id}`, { method: 'DELETE' });
      toast('success', 'IP range removed');
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove IP range');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-sm text-destructive">
        {error || 'Failed to load security settings'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="bpp-page-title flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground/50" />
          Security &amp; access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Office IP and device restrictions for members. Owner-only configuration.
        </p>
      </div>

      {/* Log-only banner */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-amber-800 dark:text-amber-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-[13px] font-medium leading-relaxed">
          Log-only mode: access restrictions are being observed, not enforced yet. Members are not
          blocked — denied attempts are recorded below.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* User access policy */}
      <section className="bpp-card overflow-hidden">
        <div className="border-b border-border/30 px-5 py-3.5">
          <span className="text-sm font-semibold">User access policy</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                <th className="px-5 py-2.5">User</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">Status</th>
                <th className="px-4 py-2.5">Access mode</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const bypass = u.role === 'owner' || u.role === 'admin';
                return (
                  <tr key={u.id} className="border-b border-border/25 last:border-0">
                    <td className="px-5 py-2.5">
                      <p className="font-medium tracking-tight">{displayName(u)}</p>
                      <p className="text-[11px] text-muted-foreground/55">{u.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${roleBadge(u.role)}`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground/60 sm:table-cell">
                      {u.status}
                    </td>
                    <td className="px-4 py-2.5">
                      {bypass ? (
                        <span className="text-xs text-muted-foreground/50">
                          Unrestricted — always bypassed
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={u.accessMode}
                            disabled={savingUser === u.id}
                            onChange={(e) => updateMode(u.id, e.target.value as Mode)}
                            className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
                          >
                            {MODES.map((m) => (
                              <option key={m.value} value={m.value}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          {savingUser === u.id && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* IP allowlist */}
      <section className="bpp-card overflow-hidden">
        <div className="border-b border-border/30 px-5 py-3.5">
          <span className="text-sm font-semibold">Allowed IP ranges</span>
        </div>
        <div className="space-y-4 p-5">
          <form onSubmit={addIp} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">
                IP address or CIDR
              </label>
              <input
                value={ipValue}
                onChange={(e) => setIpValue(e.target.value)}
                placeholder="203.0.113.0/24"
                className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">
                Label <span className="font-normal text-muted-foreground/40">(optional)</span>
              </label>
              <input
                value={ipLabel}
                onChange={(e) => setIpLabel(e.target.value)}
                placeholder="Office desktop network"
                className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground/70">Scope</label>
              <select
                value={ipScope}
                onChange={(e) => setIpScope(e.target.value)}
                className="w-full rounded-lg border border-border/50 bg-background px-2.5 py-2 text-sm outline-none transition-colors focus:border-primary/30 focus:ring-2 focus:ring-primary/15 sm:w-44"
              >
                <option value="">Workspace-wide</option>
                {data.users
                  .filter((u) => u.role !== 'owner' && u.role !== 'admin')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {displayName(u)}
                    </option>
                  ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={addingIp}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-card transition-shadow hover:shadow-elevated disabled:opacity-50"
            >
              {addingIp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </form>

          {data.ipRanges.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/40 px-4 py-6 text-center text-xs text-muted-foreground/50">
              No allowed IP ranges yet. Add your office network above.
            </p>
          ) : (
            <div className="divide-y divide-border/25 overflow-hidden rounded-xl border border-border/40">
              {data.ipRanges.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium">{r.value}</p>
                    <p className="truncate text-[11px] text-muted-foreground/55">
                      {r.label ? `${r.label} · ` : ''}
                      {r.userId ? nameForUser(r.userId) : 'Workspace-wide'}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteIp(r.id)}
                    aria-label="Remove range"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Devices (read-only) */}
      <section className="bpp-card overflow-hidden">
        <div className="border-b border-border/30 px-5 py-3.5">
          <span className="text-sm font-semibold">Approved devices</span>
        </div>
        <div className="p-5">
          {data.devices.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/40 px-4 py-6 text-center text-xs text-muted-foreground/50">
              No devices registered yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
                    <th className="py-2 pr-3">Status</th>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Label</th>
                    <th className="hidden px-3 py-2 md:table-cell">Last IP</th>
                    <th className="hidden px-3 py-2 lg:table-cell">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d) => (
                    <tr key={d.id} className="border-b border-border/25 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            d.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : d.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          <Monitor className="h-3 w-3" />
                          {d.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{d.userId ? nameForUser(d.userId) : 'Shared'}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground/70" title={d.userAgent ?? ''}>
                        {d.deviceLabel || d.browser || '—'}
                      </td>
                      <td className="hidden px-3 py-2.5 font-mono text-[11px] text-muted-foreground/60 md:table-cell">
                        {d.lastIp ?? '—'}
                      </td>
                      <td className="hidden px-3 py-2.5 text-[11px] text-muted-foreground/55 lg:table-cell">
                        {formatTs(d.lastSeenAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Security alerts */}
      <section className="bpp-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <ShieldAlert className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-semibold">Security alerts</span>
          {data.denials.length > 0 && (
            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/40">
              {data.denials.length} recent
            </span>
          )}
        </div>
        <div className="p-5">
          {data.denials.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/40 px-4 py-6 text-center text-xs text-muted-foreground/50">
              No access alerts. Denied attempts will appear here.
            </p>
          ) : (
            <div className="space-y-2">
              {data.denials.map((d) => (
                <div
                  key={d.id}
                  className="flex items-start gap-3 rounded-xl border border-border/30 bg-muted/10 px-3.5 py-2.5"
                >
                  <UserIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium tracking-tight">
                      {displayName(d.actor)}
                      {d.actor && (
                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/45">
                          {d.actor.role}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                      <span className="font-mono">{d.ip ?? 'unknown IP'}</span>
                      {d.meta?.mode ? ` · mode ${d.meta.mode}` : ''}
                      {d.meta?.deviceStatus ? ` · device ${d.meta.deviceStatus}` : ''}
                    </p>
                    {d.userAgent && (
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground/40" title={d.userAgent}>
                        {d.userAgent}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">
                      log-only
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground/40">
                      {formatTs(d.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
