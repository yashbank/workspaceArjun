import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { collectSubtreeFolderIds } from '@/server/folders/tree';
import type { Folder } from '@/generated/prisma/client';

export type FolderWithCounts = Folder & {
  _count: { children: number; files: number };
};

const FOLDERS_LIST_LIMIT = 500;

/**
 * Resolves a folder's display name for audit snapshots. Returns "Root" when the
 * id is null (top level) or the folder can no longer be found. Names are
 * captured at action time so later renames/deletes don't break activity text.
 */
export async function folderNameOrRoot(folderId: string | null): Promise<string> {
  if (!folderId) return 'Root';
  const folder = await db.folder.findUnique({
    where: { id: folderId },
    select: { name: true },
  });
  return folder?.name ?? 'Root';
}

export async function listFolders(parentId: string | null): Promise<FolderWithCounts[]> {
  await requirePermission('folders:read');
  return db.folder.findMany({
    where: { parentId, deletedAt: null },
    include: {
      _count: {
        select: {
          children: { where: { deletedAt: null } },
          files: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: { name: 'asc' },
    take: FOLDERS_LIST_LIMIT,
  }) as Promise<FolderWithCounts[]>;
}

export async function getFolder(id: string): Promise<Folder | null> {
  await requirePermission('folders:read');
  return db.folder.findFirst({ where: { id, deletedAt: null } });
}

export async function getBreadcrumbs(folderId: string | null): Promise<{ id: string; name: string }[]> {
  if (!folderId) return [];
  const crumbs: { id: string; name: string }[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null } | null =
      await db.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });
    if (!folder) break;
    crumbs.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  return crumbs;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const user = await requirePermission('folders:write');

  if (parentId) {
    const parent = await db.folder.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent) throw new Error('Parent folder not found');
  }

  const folder = await db.folder.create({
    data: { name: name.trim(), parentId, ownerId: user.id },
  });

  await logAuditEvent({
    actor: user,
    action: 'folder.create',
    targetType: 'folder',
    targetId: folder.id,
    meta: { name: folder.name, parentId },
  });

  return folder;
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const user = await requirePermission('folders:write');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: null } });
  if (!folder) throw new Error('Folder not found');

  const updated = await db.folder.update({
    where: { id },
    data: { name: name.trim() },
  });

  await logAuditEvent({
    actor: user,
    action: 'folder.rename',
    targetType: 'folder',
    targetId: id,
    meta: { oldName: folder.name, newName: name.trim() },
  });

  return updated;
}

export async function moveFolder(id: string, targetParentId: string | null): Promise<Folder> {
  const user = await requirePermission('folders:write');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: null } });
  if (!folder) throw new Error('Folder not found');

  if (targetParentId === id) throw new Error('Cannot move a folder into itself');

  if (targetParentId) {
    const target = await db.folder.findFirst({ where: { id: targetParentId, deletedAt: null } });
    if (!target) throw new Error('Target folder not found');

    // Prevent cycle: walk up from targetParentId and ensure we never hit `id`
    let cursor: string | null = targetParentId;
    while (cursor) {
      if (cursor === id) throw new Error('Cannot move a folder into its own descendant');
      const ancestor: { parentId: string | null } | null = await db.folder.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = ancestor?.parentId ?? null;
    }

    // Check for duplicate name in target
    const dupe = await db.folder.findFirst({
      where: { name: folder.name, parentId: targetParentId, deletedAt: null, id: { not: id } },
    });
    if (dupe) throw new Error(`A folder named "${folder.name}" already exists in the target location`);
  }

  const fromName = await folderNameOrRoot(folder.parentId);
  const toName = await folderNameOrRoot(targetParentId);

  const updated = await db.folder.update({
    where: { id },
    data: { parentId: targetParentId },
  });

  await logAuditEvent({
    actor: user,
    action: 'folder.move',
    targetType: 'folder',
    targetId: id,
    meta: {
      name: folder.name,
      fromParent: folder.parentId,
      toParent: targetParentId,
      fromName,
      toName,
    },
  });

  return updated;
}

/**
 * Moves a folder to trash together with its entire subtree — all nested folders
 * and every file inside them — stamped with one shared `deletedAt` timestamp so
 * the group can be restored as a unit. Files are never left behind active, so
 * nothing becomes loose at the root. Only currently-active rows are stamped, so
 * items already individually trashed keep their own (earlier) timestamp.
 */
export async function softDeleteFolder(id: string): Promise<void> {
  const user = await requirePermission('folders:delete');
  const folder = await db.folder.findFirst({ where: { id, deletedAt: null } });
  if (!folder) throw new Error('Folder not found');

  const now = new Date();
  const folderIds = await collectSubtreeFolderIds(id, 'active');

  const [files] = await db.$transaction([
    db.file.updateMany({
      where: { folderId: { in: folderIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
    db.folder.updateMany({
      where: { id: { in: folderIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
  ]);

  await logAuditEvent({
    actor: user,
    action: 'folder.delete',
    targetType: 'folder',
    targetId: id,
    meta: { name: folder.name, folderCount: folderIds.length, fileCount: files.count },
  });
}
