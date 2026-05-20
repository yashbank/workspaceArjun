export type UserAccountState = 'active' | 'deactivated' | 'auth_missing';

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  accountState?: UserAccountState;
  authExists?: boolean;
};

export type UserMenuAction = {
  id: string;
  label: string;
  disabled: boolean;
  reason?: string;
  destructive?: boolean;
};

export function resolveAccountState(user: AdminUserRow): UserAccountState {
  if (user.accountState) return user.accountState;
  if (user.status === 'active') return 'active';
  return user.authExists === false ? 'auth_missing' : 'deactivated';
}

export function buildUserMenuActions(params: {
  user: AdminUserRow;
  actorRole: string;
  canRemove: boolean;
  atSeatLimit: boolean;
}): UserMenuAction[] {
  const { user: u, actorRole, canRemove, atSeatLimit } = params;
  const isOwner = u.role === 'owner';
  const state = resolveAccountState(u);
  const actions: UserMenuAction[] = [];

  if (isOwner) return actions;

  if (state === 'active') {
    actions.push({
      id: 'deactivate',
      label: 'Deactivate',
      disabled: false,
      destructive: true,
    });
  } else if (state === 'deactivated') {
    actions.push({
      id: 'reactivate',
      label: 'Reactivate',
      disabled: atSeatLimit,
      reason: atSeatLimit ? 'Seat limit reached. Free a seat first.' : undefined,
    });
  } else if (state === 'auth_missing') {
    actions.push({
      id: 'invite_again',
      label: 'Invite again',
      disabled: atSeatLimit,
      reason: atSeatLimit ? 'Seat limit reached. Free a seat first.' : undefined,
    });
  }

  if (actorRole === 'owner' && state === 'active') {
    actions.push({ id: 'transfer', label: 'Transfer ownership', disabled: false });
  }

  if (canRemove && state === 'auth_missing') {
    actions.push({
      id: 'remove',
      label: 'Remove from workspace',
      disabled: false,
      destructive: true,
      reason: 'Removes profile and transfers owned files/folders to the owner',
    });
  } else if (canRemove && state === 'deactivated') {
    actions.push({
      id: 'remove',
      label: 'Remove permanently',
      disabled: false,
      destructive: true,
      reason: 'Transfers owned content to the owner, then deletes Auth and profile',
    });
  }

  return actions;
}
