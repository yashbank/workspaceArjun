import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { deleteObject } from '@/server/storage';
import { isStorageConfigured } from '@/server/storage';

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
  }) as Promise<TrashedFile[]>;
}

export async function restoreFolder(id: string): Promise<void> {
  const user = await requirePermission('folders:restore');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!folder) throw new Error('Folder not found in trash');

  await db.folder.update({ where: { id }, data: { deletedAt: null } });

  await logAuditEvent({
    actor: user,
    action: 'folder.restore',
    targetType: 'folder',
    targetId: id,
    meta: { name: folder.name },
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

export async function permanentDeleteFolder(id: string): Promise<void> {
  const user = await requirePermission('folders:permanent_delete');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!folder) throw new Error('Folder not found in trash');

  await db.folder.delete({ where: { id } });

  await logAuditEvent({
    actor: user,
    action: 'folder.permanent_delete',
    targetType: 'folder',
    targetId: id,
    meta: { name: folder.name },
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
