'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Lock,
  Loader2,
  Trash2,
  Plus,
  ShieldAlert,
  Globe,
  User as UserIcon,
  Monitor,
  Eye,
  Copy,
  Check,
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
type Overview = {
  users: OverviewUser[];
  ipRanges: IpRange[];
  devices: Device[];
  denials: Denial[];
  accessDetectionEnabled: boolean;
  accessEnforcementEnabled: boolean;
  viewerIsOwner: boolean;
};

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

function AccessCodeCell({
  code,
  busy,
  onReveal,
}: {
  code?: string;
  busy: boolean;
  onReveal: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (code) {
    return (
      <div className="flex items-center gap-2">
        <code className="rounded-md bg-muted/40 px-2 py-1 font-mono text-xs font-semibold tracking-[0.2em]">
          {code}
        </code>
        <button
          type="button"
          aria-label="Copy access code"
          onClick={() => {
            navigator.clipboard?.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="text-[10px] text-muted-foreground/40">hides in 5s</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onReveal}
      disabled={busy}
      aria-label="Reveal access code"
      className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
      <span className="font-mono tracking-[0.2em]">••••••••</span>
    </button>
  );
}

function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/25'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function SecurityPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [togglingEnforce, setTogglingEnforce] = useState(false);
  // Per-user access codes revealed by the Owner; each auto-hides after 5s.
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const codeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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

  // Clear any pending code-hide timers on unmount.
  useEffect(() => {
    const timers = codeTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

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

  async function toggleEnforcement(next: boolean) {
    setTogglingEnforce(true);
    // Optimistic: flip immediately, revert if the request fails.
    setData((prev) => (prev ? { ...prev, accessEnforcementEnabled: next } : prev));
    try {
      await apiFetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enforcement: next }),
      });
      toast('success', next ? 'Enforcement turned on' : 'Enforcement turned off');
    } catch (e) {
      setData((prev) => (prev ? { ...prev, accessEnforcementEnabled: !next } : prev));
      toast('error', e instanceof Error ? e.message : 'Could not update enforcement');
    } finally {
      setTogglingEnforce(false);
    }
  }

  async function revealCode(userId: string) {
    if (codes[userId]) return; // already visible
    setRevealingId(userId);
    try {
      const { code } = await apiFetch<{ code: string }>(
        `/api/admin/security/users/${userId}/access-code`,
        { method: 'POST' },
      );
      setCodes((p) => ({ ...p, [userId]: code }));
      clearTimeout(codeTimers.current[userId]);
      // Auto-hide after 5 seconds so a code is never left on screen.
      codeTimers.current[userId] = setTimeout(() => {
        setCodes((p) => {
          const next = { ...p };
          delete next[userId];
          return next;
        });
      }, 5000);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not reveal access code');
    } finally {
      setRevealingId(null);
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

  async function setDevice(id: string, status: 'approved' | 'revoked') {
    try {
      await apiFetch(`/api/admin/security/devices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      toast('success', status === 'revoked' ? 'Device revoked' : 'Device approved');
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not update device');
    }
  }

  async function deleteDevice(id: string) {
    try {
      await apiFetch(`/api/admin/security/devices/${id}`, { method: 'DELETE' });
      toast('success', 'Device removed');
      await load();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove device');
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

  const detectionOn = data.accessDetectionEnabled;
  const enforcementOn = detectionOn && data.accessEnforcementEnabled;
  const runtimeMode = !detectionOn
    ? { label: 'Disabled', cls: 'bg-muted/40 text-muted-foreground ring-border/50' }
    : enforcementOn
      ? { label: 'Protected', cls: 'bg-primary/10 text-primary ring-primary/20' }
      : { label: 'Monitoring', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300' };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="bpp-page-title flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground/50" />
            Security &amp; access
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Office IP and device restrictions for members. Owner-only configuration.
          </p>
        </div>
        <span
          className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${runtimeMode.cls}`}
        >
          {runtimeMode.label}
        </span>
      </div>

      {/* Enforcement toggle — plain-language on/off control */}
      <section className="bpp-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldAlert
                className={`h-4 w-4 ${enforcementOn ? 'text-primary' : 'text-muted-foreground/50'}`}
              />
              <span className="text-sm font-semibold">Enforce office IP &amp; device access</span>
            </div>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              {!detectionOn
                ? 'Access control is currently disabled for this workspace — members are neither checked nor blocked.'
                : enforcementOn
                  ? 'On — restricted members can only sign in from an approved office IP or a registered device. Owner and admin always have access.'
                  : 'Off — sign-ins are recorded below for review, but no one is blocked yet. Turn this on to start enforcing and to configure allowed IPs and devices.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {togglingEnforce && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />}
            <Switch
              checked={enforcementOn}
              disabled={!detectionOn || togglingEnforce}
              onChange={toggleEnforcement}
            />
          </div>
        </div>
      </section>

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
                {data.viewerIsOwner && <th className="px-4 py-2.5">Access code</th>}
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
                    {data.viewerIsOwner && (
                      <td className="px-4 py-2.5">
                        <AccessCodeCell
                          code={codes[u.id]}
                          busy={revealingId === u.id}
                          onReveal={() => revealCode(u.id)}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!enforcementOn && detectionOn && (
        <div className="rounded-2xl border border-dashed border-border/50 bg-muted/15 px-5 py-4 text-[13px] text-muted-foreground">
          Turn on enforcement above to configure allowed office IPs and approved devices.
        </div>
      )}

      {enforcementOn && (
        <>
      {/* IP allowlist */}
      <section className="bpp-card overflow-hidden">
        <div className="border-b border-border/30 px-5 py-3.5">
          <span className="text-sm font-semibold">Allowed IP ranges</span>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
            For reliable office-only access, use the office broadband static public IP. Mobile
            hotspot IPs may change.
          </p>
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
                    <th className="px-3 py-2 text-right">Actions</th>
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
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {d.status === 'approved' ? (
                            <button
                              onClick={() => setDevice(d.id, 'revoked')}
                              className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              Revoke
                            </button>
                          ) : (
                            <button
                              onClick={() => setDevice(d.id, 'approved')}
                              className="rounded-md px-2 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
                            >
                              Approve
                            </button>
                          )}
                          <button
                            onClick={() => deleteDevice(d.id)}
                            aria-label="Remove device"
                            className="rounded-lg p-1.5 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
        </>
      )}

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
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                        d.meta?.enforced
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-muted/40 text-muted-foreground/50'
                      }`}
                    >
                      {d.meta?.enforced ? 'Blocked' : 'Log-only'}
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
