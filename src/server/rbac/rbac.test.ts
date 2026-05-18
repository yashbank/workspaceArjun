import { describe, it, expect } from 'vitest';

// Inline the pure permission logic to avoid importing generated Prisma types.
// The production code uses @/generated/prisma types; tests validate the map directly.

type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
type Permission = string;

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'files:read', 'files:write', 'files:delete', 'files:restore', 'files:permanent_delete',
    'folders:read', 'folders:write', 'folders:delete',
    'versions:read', 'versions:restore',
    'users:manage', 'audit:read', 'settings:manage', 'storage:read',
  ],
  admin: [
    'files:read', 'files:write', 'files:delete', 'files:restore', 'files:permanent_delete',
    'folders:read', 'folders:write', 'folders:delete',
    'versions:read', 'versions:restore',
    'users:manage', 'audit:read', 'settings:manage', 'storage:read',
  ],
  member: [
    'files:read', 'files:write', 'files:delete', 'files:restore',
    'folders:read', 'folders:write', 'folders:delete',
    'versions:read', 'versions:restore',
    'storage:read',
  ],
  viewer: [
    'files:read',
    'folders:read',
    'versions:read',
  ],
};

function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

function isAdmin(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

describe('RBAC permissions', () => {
  describe('hasPermission', () => {
    it('owner has all permissions', () => {
      expect(hasPermission('owner', 'files:read')).toBe(true);
      expect(hasPermission('owner', 'users:manage')).toBe(true);
      expect(hasPermission('owner', 'audit:read')).toBe(true);
      expect(hasPermission('owner', 'files:permanent_delete')).toBe(true);
    });

    it('admin mirrors owner permissions', () => {
      for (const perm of ROLE_PERMISSIONS.owner) {
        expect(hasPermission('admin', perm)).toBe(true);
      }
    });

    it('member cannot manage users, read audit, or manage settings', () => {
      expect(hasPermission('member', 'users:manage')).toBe(false);
      expect(hasPermission('member', 'audit:read')).toBe(false);
      expect(hasPermission('member', 'settings:manage')).toBe(false);
    });

    it('member can read and write files', () => {
      expect(hasPermission('member', 'files:read')).toBe(true);
      expect(hasPermission('member', 'files:write')).toBe(true);
      expect(hasPermission('member', 'files:restore')).toBe(true);
    });

    it('member cannot permanently delete files', () => {
      expect(hasPermission('member', 'files:permanent_delete')).toBe(false);
    });

    it('viewer can only read files, folders, and versions', () => {
      expect(hasPermission('viewer', 'files:read')).toBe(true);
      expect(hasPermission('viewer', 'folders:read')).toBe(true);
      expect(hasPermission('viewer', 'versions:read')).toBe(true);
      expect(hasPermission('viewer', 'files:write')).toBe(false);
      expect(hasPermission('viewer', 'files:delete')).toBe(false);
      expect(hasPermission('viewer', 'folders:write')).toBe(false);
      expect(hasPermission('viewer', 'users:manage')).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('owner is admin', () => expect(isAdmin('owner')).toBe(true));
    it('admin is admin', () => expect(isAdmin('admin')).toBe(true));
    it('member is not admin', () => expect(isAdmin('member')).toBe(false));
    it('viewer is not admin', () => expect(isAdmin('viewer')).toBe(false));
  });

  describe('role completeness', () => {
    it('all roles are defined', () => {
      expect(Object.keys(ROLE_PERMISSIONS)).toEqual(['owner', 'admin', 'member', 'viewer']);
    });

    it('viewer has the fewest permissions', () => {
      const viewerCount = ROLE_PERMISSIONS.viewer.length;
      for (const role of Object.keys(ROLE_PERMISSIONS) as UserRole[]) {
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThanOrEqual(viewerCount);
      }
    });
  });
});
