import { describe, it, expect } from 'vitest';
import { parseInvitedRole, resolveProfileRole } from './roles';

describe('parseInvitedRole', () => {
  it('returns valid invited roles from metadata', () => {
    expect(parseInvitedRole({ invited_role: 'admin' })).toBe('admin');
    expect(parseInvitedRole({ invited_role: 'member' })).toBe('member');
    expect(parseInvitedRole({ invited_role: 'viewer' })).toBe('viewer');
  });

  it('rejects invalid or missing metadata', () => {
    expect(parseInvitedRole(null)).toBeNull();
    expect(parseInvitedRole({ invited_role: 'superuser' })).toBeNull();
    expect(parseInvitedRole({})).toBeNull();
  });
});

describe('resolveProfileRole', () => {
  it('makes the first profile owner', () => {
    expect(resolveProfileRole({ profileCount: 0, invitedRole: 'member' })).toBe('owner');
  });

  it('uses invited role for subsequent profiles', () => {
    expect(resolveProfileRole({ profileCount: 1, invitedRole: 'admin' })).toBe('admin');
    expect(resolveProfileRole({ profileCount: 2, invitedRole: 'viewer' })).toBe('viewer');
  });

  it('falls back to member without invite metadata', () => {
    expect(resolveProfileRole({ profileCount: 1, invitedRole: null })).toBe('member');
  });

  it('does not assign owner from invite metadata alone', () => {
    expect(resolveProfileRole({ profileCount: 1, invitedRole: 'owner' })).toBe('member');
  });
});
