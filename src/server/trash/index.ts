import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { deleteObject } from '@/server/storage';
import { isStorageConfigured } from '@/server/storage';
import { collectSubtreeFolderIds } from '@/server/folders/tree';

type TrashedFolder = {
  id: string;
  name: string;
  parentId: string | null;
  deletedAt: Date;
  owner: { email: string; name: string | null };
};

type TrashedFile = {
  id: string;
  name: string;
  mimeType: string | null;
  folderId: string | null;
  deletedAt: Date;
  owner: { email: string; name: string | null };
  currentVersion: { sizeBytes: bigint; createdAt: Date } | null;
};

const TRASH_LIST_LIMIT = 200;

export async function listTrashedFolders(): Promise<TrashedFolder[]> {
  await requirePermission('folders:read');
  return db.folder.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true,
      name: true,
      parentId: true,
      deletedAt: true,
      owner: { select: { email: true, name: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: TRASH_LIST_LIMIT,
  }) as Promise<TrashedFolder[]>;
}

export async function listTrashedFiles(): Promise<TrashedFile[]> {
  await requirePermission('files:read');
  return db.file.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true,
      name: true,
      mimeType: true,
      folderId: true,
      deletedAt: true,
      owner: { select: { email: true, name: true } },
      currentVersion: { select: { sizeBytes: true, createdAt: true } },
    },
    orderBy: { deletedAt: 'desc' },
    take: TRASH_LIST_LIMIT,
  }) as Promise<TrashedFile[]>;
}

/**
 * Restores a trashed folder together with the exact subtree that was trashed
 * with it. The trash group is identified by the shared `deletedAt` timestamp set
 * in `softDeleteFolder`, so items trashed in a different operation are left
 * untouched.
 */
export async function restoreFolder(id: string): Promise<void> {
  const user = await requirePermission('folders:restore');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!folder || !folder.deletedAt) throw new Error('Folder not found in trash');

  const groupTs = folder.deletedAt;
  const folderIds = await collectSubtreeFolderIds(id, { equals: groupTs });

  const [, files] = await db.$transaction([
    db.folder.updateMany({
      where: { id: { in: folderIds }, deletedAt: groupTs },
      data: { deletedAt: null },
    }),
    db.file.updateMany({
      where: { folderId: { in: folderIds }, deletedAt: groupTs },
      data: { deletedAt: null },
    }),
  ]);

  await logAuditEvent({
    actor: user,
    action: 'folder.restore',
    targetType: 'folder',
    targetId: id,
    meta: { name: folder.name, folderCount: folderIds.length, fileCount: files.count },
  });
}

export async function restoreFile(id: string): Promise<void> {
  const user = await requirePermission('files:restore');
  const file = await db.file.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!file) throw new Error('File not found in trash');

  await db.file.update({ where: { id }, data: { deletedAt: null } });

  await logAuditEvent({
    actor: user,
    action: 'file.restore',
    targetType: 'file',
    targetId: id,
    meta: { name: file.name },
  });
}

/**
 * Permanently deletes a trashed folder and its entire subtree — nested folders
 * and all files (with every version) inside them. File records are deleted
 * explicitly (not left to the schema's `SetNull`), so no file is ever orphaned
 * to the root. Storage blobs are removed best-effort and storage usage is
 * decremented by the purged bytes/files.
 */
export async function permanentDeleteFolder(id: string): Promise<void> {
  const user = await requirePermission('folders:permanent_delete');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!folder) throw new Error('Folder not found in trash');

  const folderIds = await collectSubtreeFolderIds(id, 'any');

  const files = await db.file.findMany({
    where: { folderId: { in: folderIds } },
    include: { versions: true },
  });

  if (isStorageConfigured()) {
    for (const file of files) {
      for (const version of file.versions) {
        try {
          await deleteObject(version.storageKey);
        } catch {
          // Best-effort: continue even if a storage delete fails
        }
      }
    }
  }

  const totalBytes = files.reduce(
    (sum, file) => sum + file.versions.reduce((s, v) => s + v.sizeBytes, BigInt(0)),
    BigInt(0),
  );
  const fileCount = files.length;

  // Delete files first (versions cascade) so no file is left referencing a
  // folder via SetNull, then delete the folders themselves.
  await db.$transaction([
    db.file.deleteMany({ where: { folderId: { in: folderIds } } }),
    db.folder.deleteMany({ where: { id: { in: folderIds } } }),
  ]);

  if (totalBytes > BigInt(0) || fileCount > 0) {
    await db.storageUsage.updateMany({
      data: {
        totalBytes: { decrement: totalBytes },
        fileCount: { decrement: fileCount },
      },
    });
  }

  await logAuditEvent({
    actor: user,
    action: 'folder.permanent_delete',
    targetType: 'folder',
    targetId: id,
    meta: { name: folder.name, folderCount: folderIds.length, fileCount },
  });
}

export async function permanentDeleteFile(id: string): Promise<void> {
  const user = await requirePermission('files:permanent_delete');
  const file = await db.file.findFirst({
    where: { id, deletedAt: { not: null } },
    include: { versions: true },
  });
  if (!file) throw new Error('File not found in trash');

  if (isStorageConfigured()) {
    for (const version of file.versions) {
      try {
        await deleteObject(version.storageKey);
      } catch {
        // Best-effort: continue even if a storage delete fails
      }
    }
  }

  const totalBytes = file.versions.reduce((sum, v) => sum + v.sizeBytes, BigInt(0));

  await db.file.delete({ where: { id } });

  if (totalBytes > BigInt(0)) {
    await db.storageUsage.updateMany({
      data: {
        totalBytes: { decrement: totalBytes },
        fileCount: { decrement: 1 },
      },
    });
  }

  await logAuditEvent({
    actor: user,
    action: 'file.permanent_delete',
    targetType: 'file',
    targetId: id,
    meta: { name: file.name, versionsDeleted: file.versions.length },
  });
}

export async function bulkRestoreTrash(input: {
  folderIds: string[];
  fileIds: string[];
}): Promise<{ restoredFolders: number; restoredFiles: number }> {
  let restoredFolders = 0;
  let restoredFiles = 0;

  for (const id of input.folderIds) {
    try {
      await restoreFolder(id);
      restoredFolders++;
    } catch {
      // skip missing or permission errors per item
    }
  }
  for (const id of input.fileIds) {
    try {
      await restoreFile(id);
      restoredFiles++;
    } catch {
      // skip
    }
  }

  return { restoredFolders, restoredFiles };
}

export async function bulkPermanentDeleteTrash(input: {
  folderIds: string[];
  fileIds: string[];
}): Promise<{ deletedFolders: number; deletedFiles: number }> {
  let deletedFolders = 0;
  let deletedFiles = 0;

  for (const id of input.folderIds) {
    try {
      await permanentDeleteFolder(id);
      deletedFolders++;
    } catch {
      // skip
    }
  }
  for (const id of input.fileIds) {
    try {
      await permanentDeleteFile(id);
      deletedFiles++;
    } catch {
      // skip
    }
  }

  return { deletedFolders, deletedFiles };
}
