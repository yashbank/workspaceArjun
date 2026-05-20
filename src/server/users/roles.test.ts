import { describe, it, expect } from 'vitest';
import {
  parseInvitedRole,
  resolveProfileRole,
  getInvitableRolesForActor,
  canActorInviteRole,
} from './roles';

describe('parseInvitedRole', () => {
  it('returns valid invited roles from metadata', () => {
    expect(parseInvitedRole({ invited_role: 'admin' })).toBe('admin');
    expect(parseInvitedRole({ invited_role: 'member' })).toBe('member');
  });

  it('rejects invalid or missing metadata', () => {
    expect(parseInvitedRole(null)).toBeNull();
    expect(parseInvitedRole({ invited_role: 'superuser' })).toBeNull();
  });
});

describe('resolveProfileRole', () => {
  it('makes the first profile owner', () => {
    expect(resolveProfileRole({ profileCount: 0, invitedRole: 'member' })).toBe('owner');
  });

  it('uses invited role for subsequent profiles', () => {
    expect(resolveProfileRole({ profileCount: 1, invitedRole: 'admin' })).toBe('admin');
  });

  it('falls back to member without invite metadata', () => {
    expect(resolveProfileRole({ profileCount: 1, invitedRole: null })).toBe('member');
  });
});

describe('invite role restrictions', () => {
  it('owner can invite admin and member', () => {
    expect(getInvitableRolesForActor('owner')).toEqual(['admin', 'member']);
    expect(canActorInviteRole('owner', 'admin')).toBe(true);
    expect(canActorInviteRole('owner', 'member')).toBe(true);
    expect(canActorInviteRole('owner', 'viewer')).toBe(false);
  });

  it('admin can invite member only', () => {
    expect(getInvitableRolesForActor('admin')).toEqual(['member']);
    expect(canActorInviteRole('admin', 'member')).toBe(true);
    expect(canActorInviteRole('admin', 'admin')).toBe(false);
  });

  it('member cannot invite', () => {
    expect(getInvitableRolesForActor('member')).toEqual([]);
    expect(canActorInviteRole('member', 'member')).toBe(false);
  });
});
