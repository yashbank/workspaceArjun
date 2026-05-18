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

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

const roleBadge: Record<string, string> = {
  owner: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  admin: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  member: 'bg-green-500/15 text-green-700 dark:text-green-400',
  viewer: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [roleMenu, setRoleMenu] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<UserItem[]>('/api/admin/users');
      setUsers(data);
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

  // Close menus on outside click
  useEffect(() => {
    function handleClick() {
      if (roleMenu) setRoleMenu(null);
      if (actionMenu) setActionMenu(null);
    }
    if (roleMenu || actionMenu) {
      const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
      return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
    }
  }, [roleMenu, actionMenu]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      setRoleMenu(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active';
    const label = newStatus === 'deactivated' ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${label} this user?`)) return;

    try {
      await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setActionMenu(null);
      await loadUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${label} user`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage team members, roles, and access
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite User
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-card">
        <div className="flex items-center gap-2 border-b border-border/30 px-5 py-3.5">
          <Users className="h-4 w-4 text-muted-foreground/40" />
          <span className="text-sm font-medium">
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-24 text-center text-sm text-muted-foreground">
            No users found
          </div>
        ) : (
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
                <tr key={u.id} className="group transition-colors hover:bg-accent/15">
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
                    <div className="relative">
                      <button
                        onClick={() => setRoleMenu(roleMenu === u.id ? null : u.id)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${roleBadge[u.role] || ''}`}
                      >
                        <Shield className="h-3 w-3" />
                        {u.role}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {roleMenu === u.id && (
                        <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100">
                          {ROLES.map((r) => (
                            <button
                              key={r}
                              disabled={r === u.role}
                              onClick={() => handleRoleChange(u.id, r)}
                              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] capitalize transition-all hover:bg-accent disabled:opacity-40"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {u.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-muted-foreground">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="relative">
                      <button
                        onClick={() => setActionMenu(actionMenu === u.id ? null : u.id)}
                        className="rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:bg-accent hover:text-foreground active:scale-90"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {actionMenu === u.id && (
                        <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100">
                          <button
                            onClick={() => handleStatusToggle(u.id, u.status)}
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
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInvite && (
        <InviteDialog
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

function InviteDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setSubmitting(true);
      setError('');
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <UserPlus className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Invite User</h2>
            <p className="text-[11px] text-muted-foreground/60">Send an invitation to add a new team member</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {error && (
            <p className="flex items-center gap-2 rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
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
