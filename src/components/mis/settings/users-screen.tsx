'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/mis/kit/button';
import { Card, CardRow } from '@/components/mis/kit/card';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { RolePicker } from '@/components/mis/roles/role-picker';
import { useT } from '@/components/mis/shell/locale-provider';
import type { MisRoleName } from '@/lib/mis/roles';
import { roleLabelKey, roleTone } from '@/lib/mis/roles';
import type { MisSeatSummary, MisUserRow, PendingMisGrant } from '@/server/mis/users';

import {
  grantMisRoleAction,
  inviteMisUserAction,
} from '@/app/(mis)/mis/settings/users/actions';

export function UsersScreen({
  users,
  seats,
  pendingGrants,
  canInvite,
  assignableRoles,
}: {
  users: MisUserRow[];
  seats: MisSeatSummary;
  pendingGrants: PendingMisGrant[];
  canInvite: boolean;
  assignableRoles: MisRoleName[];
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MisRoleName | null>(assignableRoles[0] ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = useT();

  const atSeatLimit = seats.available <= 0;

  const openInvite = () => {
    setEmail('');
    setRole(assignableRoles[0] ?? null);
    setFeedback(null);
    setInviteOpen(true);
  };

  const handleInvite = () => {
    if (!role) return;
    startTransition(async () => {
      const result = await inviteMisUserAction(email, role);
      if (result.kind === 'invited') {
        setFeedback(
          `Invite sent to ${email}. Once they accept, grant their MIS role from the list below.`,
        );
      } else {
        setInviteOpen(false);
      }
    });
  };

  const handleGrant = (userProfileId: string, grantRole: MisRoleName) => {
    startTransition(async () => {
      await grantMisRoleAction(userProfileId, grantRole);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">MIS users</h1>
            <p className="mt-0.5 text-xs font-mono text-slate-500">
              {seats.used} / {seats.max} workspace seats used
            </p>
          </div>
          {canInvite && (
            <Button onClick={openInvite} disabled={atSeatLimit && pendingGrants.length === 0}>
              + Invite
            </Button>
          )}
        </div>
        {atSeatLimit && (
          <p className="mt-2 text-sm text-amber-700">
            Seat limit reached. Free a seat, or grant a role to someone who has already
            accepted, below.
          </p>
        )}
      </div>

      {canInvite && pendingGrants.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Waiting on a MIS role
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {pendingGrants.map((p) => (
              <div key={p.userProfileId} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {p.name ?? p.email}
                  </div>
                  <div className="truncate text-xs text-slate-500">{p.email}</div>
                </div>
                <RolePickerInline
                  options={assignableRoles}
                  disabled={isPending}
                  onPick={(pickedRole) => handleGrant(p.userProfileId, pickedRole)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          People with a MIS login
        </div>
        {users.length === 0 ? (
          <EmptyState
            title="No MIS users yet"
            body={canInvite ? 'Invite the first person above.' : 'Ask the Owner to invite you.'}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <Card key={u.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-900">{u.name}</div>
                    <div className="truncate text-xs font-mono text-slate-500">
                      {u.employeeCode}
                    </div>
                  </div>
                  <StatusBadge tone={roleTone(u.role)}>{t(roleLabelKey(u.role))}</StatusBadge>
                </div>
                <CardRow label="Email" value={u.email ?? '—'} />
                <CardRow
                  label="Status"
                  value={
                    <StatusBadge tone={u.isActive ? 'good' : 'neutral'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </div>

      <SlideOver open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite to the MIS">
        <div className="flex flex-col gap-4">
          {feedback ? (
            <>
              <p className="text-sm text-slate-700">{feedback}</p>
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            </>
          ) : (
            <>
              <Input
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
              />
              <RolePicker value={role} options={assignableRoles} onChange={setRole} label="MIS role" />
              <p className="text-sm text-slate-500">
                If this email already has a workspace login, the role is granted right away.
                Otherwise a real invite email goes out, and you grant the role here once they
                accept.
              </p>
              <div className="flex gap-2 pt-2">
                <Button onClick={handleInvite} disabled={isPending || !email || !role}>
                  {isPending ? 'Sending…' : 'Send invite'}
                </Button>
                <Button variant="ghost" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </SlideOver>
    </div>
  );
}

/** A compact, inline picker for the pending-grants row — no label, no wrapper. */
function RolePickerInline({
  options,
  disabled,
  onPick,
}: {
  options: MisRoleName[];
  disabled: boolean;
  onPick: (role: MisRoleName) => void;
}) {
  const [value, setValue] = useState<MisRoleName | null>(options[0] ?? null);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <RolePicker value={value} options={options} onChange={setValue} label="" disabled={disabled} />
      <Button
        variant="secondary"
        disabled={disabled || !value}
        onClick={() => value && onPick(value)}
      >
        Grant
      </Button>
    </div>
  );
}
