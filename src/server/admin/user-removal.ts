import { db } from '@/server/db';
import { deleteAuthUser } from '@/server/admin/auth-users';
import { cancelPendingInvitesForEmail } from '@/server/users';

export type RemovalBlockReason = {
  code: 'owns_files' | 'owns_folders';
  message: string;
  fileCount?: number;
  folderCount?: number;
};

export async function getRemovalBlockReason(userId: string): Promise<RemovalBlockReason | null> {
  const [fileCount, folderCount] = await Promise.all([
    db.file.count({ where: { ownerId: userId, deletedAt: null } }),
    db.folder.count({ where: { ownerId: userId, deletedAt: null } }),
  ]);

  if (fileCount > 0 || folderCount > 0) {
    return {
      code: fileCount > 0 ? 'owns_files' : 'owns_folders',
      message:
        'This user still owns files or folders. Reassign or delete their content before permanent removal.',
      fileCount,
      folderCount,
    };
  }
  return null;
}

/** Detach FK references so UserProfile can be deleted. Does not delete auth or profile. */
export async function detachProfileReferences(
  userId: string,
  email: string,
  fallbackOwnerId: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();

  await Promise.all([
    db.favorite.deleteMany({ where: { userId } }),
    db.notification.deleteMany({ where: { userId } }),
    db.auditStar.deleteMany({ where: { userId } }),
    db.auditEvent.updateMany({ where: { actorId: userId }, data: { actorId: null } }),
    db.fileVersion.updateMany({
      where: { uploadedBy: userId },
      data: { uploadedBy: fallbackOwnerId },
    }),
    db.userInvite.updateMany({
      where: { invitedBy: userId },
      data: { invitedBy: fallbackOwnerId },
    }),
    cancelPendingInvitesForEmail(normalized),
  ]);
}

export async function deleteProfileRecord(userId: string): Promise<void> {
  await db.userProfile.delete({ where: { id: userId } });
}

/**
 * Permanent removal: DB cleanup first, then Supabase Auth, then profile row.
 * Auth is deleted only after DB prep; profile is deleted only after auth succeeds.
 */
export async function permanentlyRemoveUser(params: {
  userId: string;
  authId: string;
  email: string;
  fallbackOwnerId: string;
}): Promise<void> {
  await detachProfileReferences(params.userId, params.email, params.fallbackOwnerId);
  await deleteAuthUser(params.authId);
  await deleteProfileRecord(params.userId);
}
