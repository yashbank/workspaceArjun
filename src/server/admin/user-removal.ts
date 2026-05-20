import { db } from '@/server/db';
import { deleteAuthUser } from '@/server/admin/auth-users';
import { cancelPendingInvitesForEmail } from '@/server/users';

export type OwnershipTransferResult = {
  filesTransferred: number;
  foldersTransferred: number;
};

/** Reassign all files/folders owned by user to the workspace owner. */
export async function transferOwnedContentToOwner(
  userId: string,
  ownerId: string,
): Promise<OwnershipTransferResult> {
  if (userId === ownerId) {
    return { filesTransferred: 0, foldersTransferred: 0 };
  }

  const [filesResult, foldersResult] = await Promise.all([
    db.file.updateMany({
      where: { ownerId: userId },
      data: { ownerId },
    }),
    db.folder.updateMany({
      where: { ownerId: userId },
      data: { ownerId },
    }),
  ]);

  return {
    filesTransferred: filesResult.count,
    foldersTransferred: foldersResult.count,
  };
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

export type PermanentRemovalParams = {
  userId: string;
  authId: string;
  email: string;
  fallbackOwnerId: string;
  /** When false, skip Supabase Auth delete (already removed). */
  authExists?: boolean;
};

/**
 * Permanent removal: transfer owned content → detach FKs → delete Auth (if present) → delete profile.
 */
export async function permanentlyRemoveUser(params: PermanentRemovalParams): Promise<OwnershipTransferResult> {
  const transfer = await transferOwnedContentToOwner(params.userId, params.fallbackOwnerId);
  await detachProfileReferences(params.userId, params.email, params.fallbackOwnerId);

  if (params.authExists !== false) {
    await deleteAuthUser(params.authId);
  } else {
    console.info('[user-removal] skipping auth delete — already removed', {
      userId: params.userId.slice(0, 8),
    });
  }

  await deleteProfileRecord(params.userId);
  return transfer;
}
