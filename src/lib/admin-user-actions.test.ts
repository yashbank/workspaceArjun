import { describe, it, expect } from 'vitest';
import { buildUserMenuActions, resolveAccountState } from './admin-user-actions';

describe('admin-user-actions', () => {
  it('resolves auth_missing when deactivated without auth', () => {
    expect(
      resolveAccountState({
        id: '1',
        email: 'a@b.com',
        name: null,
        role: 'member',
        status: 'deactivated',
        authExists: false,
      }),
    ).toBe('auth_missing');
  });

  it('offers invite again instead of reactivate for auth_missing', () => {
    const actions = buildUserMenuActions({
      user: {
        id: '1',
        email: 'a@b.com',
        name: null,
        role: 'member',
        status: 'deactivated',
        accountState: 'auth_missing',
        authExists: false,
      },
      actorRole: 'owner',
      canRemove: true,
      atSeatLimit: false,
    });
    expect(actions.some((a) => a.id === 'invite_again')).toBe(true);
    expect(actions.some((a) => a.id === 'reactivate')).toBe(false);
  });

  it('disables reactivate at seat limit', () => {
    const actions = buildUserMenuActions({
      user: {
        id: '1',
        email: 'a@b.com',
        name: null,
        role: 'member',
        status: 'deactivated',
        accountState: 'deactivated',
        authExists: true,
      },
      actorRole: 'owner',
      canRemove: true,
      atSeatLimit: true,
    });
    const reactivate = actions.find((a) => a.id === 'reactivate');
    expect(reactivate?.disabled).toBe(true);
    expect(reactivate?.reason).toContain('Seat');
  });
});
