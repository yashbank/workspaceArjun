import { describe, it, expect } from 'vitest';
import { hasPermission, isAdmin } from './permissions';

describe('RBAC permissions', () => {
  describe('owner', () => {
    it('has full management permissions', () => {
      expect(hasPermission('owner', 'users:manage')).toBe(true);
      expect(hasPermission('owner', 'users:invite')).toBe(true);
      expect(hasPermission('owner', 'users:remove')).toBe(true);
      expect(hasPermission('owner', 'users:transfer_ownership')).toBe(true);
      expect(hasPermission('owner', 'files:permanent_delete')).toBe(true);
      expect(hasPermission('owner', 'settings:manage')).toBe(true);
    });
  });

  describe('admin', () => {
    it('can manage users and files but not permanent delete or settings', () => {
      expect(hasPermission('admin', 'users:manage')).toBe(true);
      expect(hasPermission('admin', 'users:invite')).toBe(true);
      expect(hasPermission('admin', 'files:permanent_delete')).toBe(false);
      expect(hasPermission('admin', 'settings:manage')).toBe(false);
      expect(hasPermission('admin', 'users:remove')).toBe(false);
      expect(hasPermission('admin', 'users:transfer_ownership')).toBe(false);
    });
  });

  describe('member', () => {
    it('can work with files but not admin or permanent delete', () => {
      expect(hasPermission('member', 'files:write')).toBe(true);
      expect(hasPermission('member', 'versions:restore')).toBe(true);
      expect(hasPermission('member', 'users:manage')).toBe(false);
      expect(hasPermission('member', 'files:permanent_delete')).toBe(false);
    });
  });

  describe('viewer', () => {
    it('is read-only', () => {
      expect(hasPermission('viewer', 'files:read')).toBe(true);
      expect(hasPermission('viewer', 'files:write')).toBe(false);
      expect(hasPermission('viewer', 'users:manage')).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('returns true for owner and admin only', () => {
      expect(isAdmin('owner')).toBe(true);
      expect(isAdmin('admin')).toBe(true);
      expect(isAdmin('member')).toBe(false);
    });
  });
});
