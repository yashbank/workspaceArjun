import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFileUpdateMany = vi.fn();
const mockFolderUpdateMany = vi.fn();
const mockFavoriteDeleteMany = vi.fn();
const mockNotificationDeleteMany = vi.fn();
const mockAuditStarDeleteMany = vi.fn();
const mockAuditEventUpdateMany = vi.fn();
const mockFileVersionUpdateMany = vi.fn();
const mockUserInviteUpdateMany = vi.fn();
const mockUserProfileDelete = vi.fn();
const mockCancelPendingInvites = vi.fn();
const mockDeleteAuthUser = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    file: { updateMany: (...args: unknown[]) => mockFileUpdateMany(...args) },
    folder: { updateMany: (...args: unknown[]) => mockFolderUpdateMany(...args) },
    favorite: { deleteMany: (...args: unknown[]) => mockFavoriteDeleteMany(...args) },
    notification: { deleteMany: (...args: unknown[]) => mockNotificationDeleteMany(...args) },
    auditStar: { deleteMany: (...args: unknown[]) => mockAuditStarDeleteMany(...args) },
    auditEvent: { updateMany: (...args: unknown[]) => mockAuditEventUpdateMany(...args) },
    fileVersion: { updateMany: (...args: unknown[]) => mockFileVersionUpdateMany(...args) },
    userInvite: { updateMany: (...args: unknown[]) => mockUserInviteUpdateMany(...args) },
    userProfile: { delete: (...args: unknown[]) => mockUserProfileDelete(...args) },
  },
}));

vi.mock('@/server/users', () => ({
  cancelPendingInvitesForEmail: (...args: unknown[]) => mockCancelPendingInvites(...args),
}));

vi.mock('@/server/admin/auth-users', () => ({
  deleteAuthUser: (...args: unknown[]) => mockDeleteAuthUser(...args),
}));

import {
  permanentlyRemoveUser,
  transferOwnedContentToOwner,
} from '@/server/admin/user-removal';
import { validatePermanentRemovalGuards } from '@/server/admin/remove-user-guards';

describe('transferOwnedContentToOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileUpdateMany.mockResolvedValue({ count: 3 });
    mockFolderUpdateMany.mockResolvedValue({ count: 2 });
  });

  it('transfers all files and folders to owner', async () => {
    const result = await transferOwnedContentToOwner('user-1', 'owner-1');

    expect(result).toEqual({ filesTransferred: 3, foldersTransferred: 2 });
    expect(mockFileUpdateMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      data: { ownerId: 'owner-1' },
    });
    expect(mockFolderUpdateMany).toHaveBeenCalledWith({
      where: { ownerId: 'user-1' },
      data: { ownerId: 'owner-1' },
    });
  });
});

describe('permanentlyRemoveUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFileUpdateMany.mockResolvedValue({ count: 1 });
    mockFolderUpdateMany.mockResolvedValue({ count: 1 });
    mockFavoriteDeleteMany.mockResolvedValue({ count: 0 });
    mockNotificationDeleteMany.mockResolvedValue({ count: 0 });
    mockAuditStarDeleteMany.mockResolvedValue({ count: 0 });
    mockAuditEventUpdateMany.mockResolvedValue({ count: 0 });
    mockFileVersionUpdateMany.mockResolvedValue({ count: 0 });
    mockUserInviteUpdateMany.mockResolvedValue({ count: 0 });
    mockUserProfileDelete.mockResolvedValue({});
    mockCancelPendingInvites.mockResolvedValue(0);
    mockDeleteAuthUser.mockResolvedValue(undefined);
  });

  it('removes auth-missing user with owned files (skips auth delete)', async () => {
    const result = await permanentlyRemoveUser({
      userId: 'user-1',
      authId: 'auth-1',
      email: 'gone@example.com',
      fallbackOwnerId: 'owner-1',
      authExists: false,
    });

    expect(result.filesTransferred).toBe(1);
    expect(mockDeleteAuthUser).not.toHaveBeenCalled();
    expect(mockUserProfileDelete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });

  it('deletes auth when user still has login', async () => {
    await permanentlyRemoveUser({
      userId: 'user-2',
      authId: 'auth-2',
      email: 'user@example.com',
      fallbackOwnerId: 'owner-1',
      authExists: true,
    });

    expect(mockDeleteAuthUser).toHaveBeenCalledWith('auth-2');
    expect(mockUserProfileDelete).toHaveBeenCalled();
  });
});

describe('validatePermanentRemovalGuards', () => {
  it('blocks admin from removing users', () => {
    const result = validatePermanentRemovalGuards({
      actorId: 'admin-1',
      actorRole: 'admin',
      targetId: 'user-1',
      targetRole: 'member',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('owner');
  });

  it('blocks owner from removing self', () => {
    const result = validatePermanentRemovalGuards({
      actorId: 'owner-1',
      actorRole: 'owner',
      targetId: 'owner-1',
      targetRole: 'owner',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('own account');
  });

  it('blocks removing another owner', () => {
    const result = validatePermanentRemovalGuards({
      actorId: 'owner-1',
      actorRole: 'owner',
      targetId: 'owner-2',
      targetRole: 'owner',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain('owner account');
  });

  it('allows owner to remove member', () => {
    const result = validatePermanentRemovalGuards({
      actorId: 'owner-1',
      actorRole: 'owner',
      targetId: 'user-1',
      targetRole: 'member',
    });
    expect(result).toEqual({ ok: true });
  });
});
