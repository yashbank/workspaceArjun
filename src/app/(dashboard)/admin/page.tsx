'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Shield,
  UserPlus,
  MoreHorizontal,
  ChevronDown,
  AlertCircle,
  Loader2,
  UserX,
  UserCheck,
  Mail,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

type UserItem = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
};

type InviteItem = {
  id: string;
  email: string;
  role: string;
  status: string;
  invitedAt: string;
  invitedByEmail: string | null;
};

type AdminUsersPayload = {
  actorRole: string;
  invitableRoles: string[];
  seats: {
    max: number;
    used: number;
    active: number;
    pendingInvites: number;
    available: number;
  };
  users: UserItem[];
  invites: InviteItem[];
};

function assignableRoles(actorRole: string, targetRole: string): string[] {
  if (targetRole === 'owner') return [];
  if (actorRole === 'owner') return ['admin', 'member', 'viewer'];
  if (actorRole === 'admin') return ['member', 'viewer'];
  return [];
}

const roleBadge: Record<string, string> = {
  owner: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  admin: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  member: 'bg-green-500/15 text-green-700 dark:text-green-400',
  viewer: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

export default function AdminPage() {
  const [data, setData] = useState<AdminUsersPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [roleMenu, setRoleMenu] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await apiFetch<AdminUsersPayload>('/api/admin/users');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    function handleClick() {
      if (roleMenu) setRoleMenu(null);
      if (actionMenu) setActionMenu(null);
    }
    if (roleMenu || actionMenu) {
      const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClick);
      };
    }
  }, [roleMenu, actionMenu]);

  const seats = data?.seats;
  const users = data?.users ?? [];
  const invites = data?.invites ?? [];
  const actorRole = data?.actorRole ?? 'member';
  const invitableRoles = data?.invitableRoles ?? ['member'];
  const atSeatLimit = seats ? seats.used >= seats.max : false;
  const canRemoveUsers = actorRole === 'owner';

  const handleRoleChange = async (userId: string, newRole: string, currentRole: string) => {
    if (currentRole === 'owner') return;
    try {
      setBusyId(userId);
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      setRoleMenu(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change role');
    } finally {
      setBusyId(null);
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: string, role: string) => {
    if (role === 'owner') return;
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active';
    const label = newStatus === 'deactivated' ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${label} this user?`)) return;

    try {
      setBusyId(userId);
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setActionMenu(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${label} user`);
    } finally {
      setBusyId(null);
    }
  };

  const handleTransferOwnership = async (userId: string, email: string) => {
    if (!confirm(`Transfer workspace ownership to ${email}? You will become an admin.`)) return;
    try {
      setBusyId(userId);
      await apiFetch('/api/admin/users/transfer-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transfer ownership');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Permanently remove this deactivated user? This cannot be undone.')) return;
    try {
      setBusyId(userId);
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setActionMenu(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setBusyId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      setBusyId(inviteId);
      await apiFetch(`/api/admin/users/invites/${inviteId}/resend`, { method: 'POST' });
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resend invite');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite-only access · secure email invites · max {seats?.max ?? 15} users
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          disabled={atSeatLimit}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.97]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite User
        </button>
      </div>

      {seats && (
        <div className="rounded-2xl border border-border/50 bg-card px-5 py-4 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/45">
                Seats used
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                {seats.used}{' '}
                <span className="text-base font-medium text-muted-foreground/50">/ {seats.max}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 dark:text-emerald-400">
                {seats.active} active
              </span>
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400">
                {seats.pendingInvites} invited
              </span>
              <span className="rounded-full bg-muted/40 px-2.5 py-1 font-medium text-muted-foreground">
                {seats.available} available
              </span>
            </div>
          </div>
          {atSeatLimit && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
              Seat limit reached. Deactivate a user or wait for a pending invite to be accepted before
              inviting someone new.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {invites.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
            <Mail className="h-4 w-4 text-amber-600/70" />
            <span className="text-sm font-medium">Pending invites ({invites.length})</span>
          </div>
          <div className="divide-y">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{inv.email}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Invited {new Date(inv.invitedAt).toLocaleDateString()}
                    {inv.invitedByEmail ? ` · by ${inv.invitedByEmail}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[inv.role] ?? ''}`}
                  >
                    {inv.role}
                  </span>
                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    Invited
                  </span>
                  <button
                    type="button"
                    disabled={busyId === inv.id}
                    onClick={() => handleResendInvite(inv.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium transition-all hover:bg-accent disabled:opacity-50"
                  >
                    {busyId === inv.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Resend
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <Users className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-medium">
            {users.length} {users.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">No users yet</div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/15 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Joined</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      actorRole={actorRole}
                      busyId={busyId}
                      roleMenu={roleMenu}
                      actionMenu={actionMenu}
                      setRoleMenu={setRoleMenu}
                      setActionMenu={setActionMenu}
                      onRoleChange={handleRoleChange}
                      onStatusToggle={handleStatusToggle}
                      onRemove={canRemoveUsers ? handleRemove : undefined}
                      onTransferOwnership={
                        actorRole === 'owner' ? handleTransferOwnership : undefined
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y md:hidden">
              {users.map((u) => (
                <UserCard
                  key={u.id}
                  user={u}
                  actorRole={actorRole}
                  busyId={busyId}
                  onRoleChange={handleRoleChange}
                  onStatusToggle={handleStatusToggle}
                  onRemove={canRemoveUsers ? handleRemove : undefined}
                  onTransferOwnership={
                    actorRole === 'owner' ? handleTransferOwnership : undefined
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      {showInvite && (
        <InviteDialog
          atSeatLimit={atSeatLimit}
          invitableRoles={invitableRoles}
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
      Deactivated
    </span>
  );
}

function UserRow({
  user: u,
  actorRole,
  busyId,
  roleMenu,
  actionMenu,
  setRoleMenu,
  setActionMenu,
  onRoleChange,
  onStatusToggle,
  onRemove,
  onTransferOwnership,
}: {
  user: UserItem;
  actorRole: string;
  busyId: string | null;
  roleMenu: string | null;
  actionMenu: string | null;
  setRoleMenu: (id: string | null) => void;
  setActionMenu: (id: string | null) => void;
  onRoleChange: (id: string, role: string, current: string) => void;
  onStatusToggle: (id: string, status: string, role: string) => void;
  onRemove?: (id: string) => void;
  onTransferOwnership?: (id: string, email: string) => void;
}) {
  const isOwner = u.role === 'owner';
  const roles = assignableRoles(actorRole, u.role);
  const canRemove = u.status === 'deactivated' && !isOwner && !!onRemove;

  return (
    <tr className="group transition-colors hover:bg-accent/15">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
            {(u.name || u.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{u.name || u.email.split('@')[0]}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5">
        {isOwner ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge.owner}`}>
            <Shield className="h-3 w-3" />
            owner
          </span>
        ) : (
          <div className="relative">
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={(e) => {
                e.stopPropagation();
                setRoleMenu(roleMenu === u.id ? null : u.id);
              }}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[u.role] || ''}`}
            >
              <Shield className="h-3 w-3" />
              {u.role}
              <ChevronDown className="h-3 w-3" />
            </button>
            {roleMenu === u.id && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float"
                onClick={(e) => e.stopPropagation()}
              >
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    disabled={r === u.role}
                    onClick={() => onRoleChange(u.id, r, u.role)}
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] capitalize transition-all hover:bg-accent disabled:opacity-40"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-5 py-3.5">
        <StatusBadge status={u.status} />
      </td>
      <td className="px-5 py-3.5 text-sm text-muted-foreground">
        {new Date(u.createdAt).toLocaleDateString()}
      </td>
      <td className="px-5 py-3.5 text-right">
        {isOwner ? (
          <span className="text-[11px] text-muted-foreground/40">Protected</span>
        ) : (
          <div className="relative inline-block">
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={(e) => {
                e.stopPropagation();
                setActionMenu(actionMenu === u.id ? null : u.id);
              }}
              className="rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:bg-accent hover:text-foreground"
            >
              {busyId === u.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
            {actionMenu === u.id && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onStatusToggle(u.id, u.status, u.role)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-all hover:bg-accent"
                >
                  {u.status === 'active' ? (
                    <>
                      <UserX className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-destructive">Deactivate</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Reactivate</span>
                    </>
                  )}
                </button>
                {onTransferOwnership && u.status === 'active' && !isOwner && (
                  <button
                    type="button"
                    onClick={() => onTransferOwnership(u.id, u.email)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-all hover:bg-accent"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Transfer ownership
                  </button>
                )}
                {canRemove && onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(u.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] text-destructive transition-all hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove user
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function UserCard({
  user: u,
  actorRole,
  busyId,
  onRoleChange,
  onStatusToggle,
  onRemove,
  onTransferOwnership,
}: {
  user: UserItem;
  actorRole: string;
  busyId: string | null;
  onRoleChange: (id: string, role: string, current: string) => void;
  onStatusToggle: (id: string, status: string, role: string) => void;
  onRemove?: (id: string) => void;
  onTransferOwnership?: (id: string, email: string) => void;
}) {
  const isOwner = u.role === 'owner';
  const roles = assignableRoles(actorRole, u.role);
  const canRemove = u.status === 'deactivated' && !isOwner && !!onRemove;

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{u.name || u.email.split('@')[0]}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
        <StatusBadge status={u.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[u.role] ?? ''}`}>
          {u.role}
        </span>
        {!isOwner &&
          roles.map((r) =>
            r !== u.role ? (
              <button
                key={r}
                type="button"
                disabled={busyId === u.id}
                onClick={() => onRoleChange(u.id, r, u.role)}
                className="rounded-lg border border-border/50 px-2 py-1 text-[11px] capitalize hover:bg-accent"
              >
                → {r}
              </button>
            ) : null,
          )}
      </div>
      {!isOwner && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busyId === u.id}
            onClick={() => onStatusToggle(u.id, u.status, u.role)}
            className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
          </button>
          {canRemove && onRemove && (
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={() => onRemove(u.id)}
              className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              Remove
            </button>
          )}
          {onTransferOwnership && u.status === 'active' && (
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={() => onTransferOwnership(u.id, u.email)}
              className="rounded-lg border border-border/50 px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Transfer ownership
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function InviteDialog({
  atSeatLimit,
  invitableRoles,
  onClose,
  onSuccess,
}: {
  atSeatLimit: boolean;
  invitableRoles: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(invitableRoles[0] ?? 'member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || atSeatLimit) return;

    try {
      setSubmitting(true);
      setError('');
      setSuccess(false);
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setSuccess(true);
      setTimeout(() => onSuccess(), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <UserPlus className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Invite User</h2>
            <p className="text-[11px] text-muted-foreground/60">
              They will receive a secure email link to set their own password
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {atSeatLimit && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              Seat limit reached. Free a seat before sending a new invite.
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              autoFocus
              disabled={atSeatLimit}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              disabled={atSeatLimit}
            >
              {invitableRoles.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              Invite sent. The user will receive an email to set their password.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim() || atSeatLimit}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send Invite
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
