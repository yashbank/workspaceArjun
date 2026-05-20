import type { UserRole } from '@/generated/prisma/client';

export type Permission =
  | 'files:read'
  | 'files:write'
  | 'files:delete'
  | 'files:restore'
  | 'files:permanent_delete'
  | 'folders:read'
  | 'folders:write'
  | 'folders:delete'
  | 'folders:restore'
  | 'folders:permanent_delete'
  | 'versions:read'
  | 'versions:restore'
  | 'users:manage'
  | 'users:invite'
  | 'users:remove'
  | 'users:transfer_ownership'
  | 'audit:read'
  | 'settings:manage'
  | 'storage:read';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'files:read',
    'files:write',
    'files:delete',
    'files:restore',
    'files:permanent_delete',
    'folders:read',
    'folders:write',
    'folders:delete',
    'folders:restore',
    'folders:permanent_delete',
    'versions:read',
    'versions:restore',
    'users:manage',
    'users:invite',
    'users:remove',
    'users:transfer_ownership',
    'audit:read',
    'settings:manage',
    'storage:read',
  ],
  admin: [
    'files:read',
    'files:write',
    'files:delete',
    'files:restore',
    'folders:read',
    'folders:write',
    'folders:delete',
    'folders:restore',
    'versions:read',
    'versions:restore',
    'users:manage',
    'users:invite',
    'audit:read',
    'storage:read',
  ],
  member: [
    'files:read',
    'files:write',
    'files:delete',
    'files:restore',
    'folders:read',
    'folders:write',
    'folders:delete',
    'folders:restore',
    'versions:read',
    'versions:restore',
    'storage:read',
  ],
  viewer: ['files:read', 'folders:read', 'versions:read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function isAdmin(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}
