import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { deleteObjects } from '@/server/storage';
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

  const storageKeys = files.flatMap((file) => file.versions.map((v) => v.storageKey));
  const totalBytes = files.reduce(
    (sum, file) => sum + file.versions.reduce((s, v) => s + v.sizeBytes, BigInt(0)),
    BigInt(0),
  );
  const fileCount = files.length;

  // DB-first: commit the delete atomically before touching storage, so an
  // interruption can only ever leave reclaimable orphan blobs (never dangling
  // rows). Files first (versions cascade) so none is SetNull-orphaned to root.
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

  // Best-effort batched blob removal after the DB commit.
  if (isStorageConfigured() && storageKeys.length > 0) {
    await deleteObjects(storageKeys);
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

  const storageKeys = file.versions.map((v) => v.storageKey);
  const totalBytes = file.versions.reduce((sum, v) => sum + v.sizeBytes, BigInt(0));

  // DB-first, then best-effort batched blob removal.
  await db.file.delete({ where: { id } });

  if (totalBytes > BigInt(0)) {
    await db.storageUsage.updateMany({
      data: {
        totalBytes: { decrement: totalBytes },
        fileCount: { decrement: 1 },
      },
    });
  }

  if (isStorageConfigured() && storageKeys.length > 0) {
    await deleteObjects(storageKeys);
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

/**
 * Set-based permanent delete: collects the full subtree of every selected folder
 * plus the selected files, then issues ONE transaction, ONE storage batch, and
 * ONE usage decrement — instead of N serial per-item operations. DB-first so an
 * interruption leaves only reclaimable orphans. Per-top-level-item audit events
 * are preserved. Returns the full set of removed ids so the client can drop the
 * exact trash rows that disappeared (subtree folders/files included).
 */
export async function bulkPermanentDeleteTrash(input: {
  folderIds: string[];
  fileIds: string[];
}): Promise<{
  deletedFolders: number;
  deletedFiles: number;
  deletedFolderIds: string[];
  deletedFileIds: string[];
}> {
  // Preserve existing permission gates (owner-only); check each kind present.
  let user: Awaited<ReturnType<typeof requirePermission>> | undefined;
  if (input.folderIds.length > 0) user = await requirePermission('folders:permanent_delete');
  if (input.fileIds.length > 0) user = await requirePermission('files:permanent_delete');
  if (!user) return { deletedFolders: 0, deletedFiles: 0, deletedFolderIds: [], deletedFileIds: [] };

  // 1. Resolve the trashed roots actually selected (skip missing/non-trashed).
  const roots =
    input.folderIds.length > 0
      ? await db.folder.findMany({
          where: { id: { in: input.folderIds }, deletedAt: { not: null } },
          select: { id: true, name: true },
        })
      : [];

  // 2. Union of every subtree folder id (keep per-root subtree for audit counts).
  const perRoot: { id: string; name: string; subtree: string[] }[] = [];
  const allFolderIdSet = new Set<string>();
  for (const root of roots) {
    const subtree = await collectSubtreeFolderIds(root.id, 'any');
    perRoot.push({ id: root.id, name: root.name, subtree });
    subtree.forEach((fid) => allFolderIdSet.add(fid));
  }
  const allFolderIds = [...allFolderIdSet];

  // 3. Directly-selected trashed files (skip missing/non-trashed).
  const selectedFiles =
    input.fileIds.length > 0
      ? await db.file.findMany({
          where: { id: { in: input.fileIds }, deletedAt: { not: null } },
          include: { versions: true },
        })
      : [];

  // 4. All files in the collected subtree (one query).
  const subtreeFiles =
    allFolderIds.length > 0
      ? await db.file.findMany({
          where: { folderId: { in: allFolderIds } },
          include: { versions: true },
        })
      : [];

  // 5. Union files by id (a selected file may also live in a selected subtree).
  const fileById = new Map<string, (typeof subtreeFiles)[number]>();
  for (const f of subtreeFiles) fileById.set(f.id, f);
  for (const f of selectedFiles) fileById.set(f.id, f);
  const allFiles = [...fileById.values()];
  const allFileIds = [...fileById.keys()];

  const storageKeys = allFiles.flatMap((f) => f.versions.map((v) => v.storageKey));
  const totalBytes = allFiles.reduce(
    (sum, f) => sum + f.versions.reduce((s, v) => s + v.sizeBytes, BigInt(0)),
    BigInt(0),
  );
  const fileCount = allFiles.length;

  // 6. ONE transaction (DB-first).
  if (allFileIds.length > 0 || allFolderIds.length > 0) {
    await db.$transaction([
      db.file.deleteMany({ where: { id: { in: allFileIds } } }),
      db.folder.deleteMany({ where: { id: { in: allFolderIds } } }),
    ]);
  }

  // 7. ONE usage decrement.
  if (totalBytes > BigInt(0) || fileCount > 0) {
    await db.storageUsage.updateMany({
      data: { totalBytes: { decrement: totalBytes }, fileCount: { decrement: fileCount } },
    });
  }

  // 8. ONE best-effort storage batch, after the commit.
  if (isStorageConfigured() && storageKeys.length > 0) {
    await deleteObjects(storageKeys);
  }

  // 9. Per-top-level-item audit events (preserves existing audit behavior).
  for (const root of perRoot) {
    const subtreeSet = new Set(root.subtree);
    const filesUnderRoot = allFiles.filter((f) => f.folderId && subtreeSet.has(f.folderId)).length;
    await logAuditEvent({
      actor: user,
      action: 'folder.permanent_delete',
      targetType: 'folder',
      targetId: root.id,
      meta: { name: root.name, folderCount: root.subtree.length, fileCount: filesUnderRoot },
    });
  }
  for (const f of selectedFiles) {
    await logAuditEvent({
      actor: user,
      action: 'file.permanent_delete',
      targetType: 'file',
      targetId: f.id,
      meta: { name: f.name, versionsDeleted: f.versions.length },
    });
  }

  return {
    deletedFolders: roots.length,
    deletedFiles: selectedFiles.length,
    deletedFolderIds: allFolderIds,
    deletedFileIds: allFileIds,
  };
}
