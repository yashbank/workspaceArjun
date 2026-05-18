// @ts-expect-error — archiver v8 is pure ESM; @types/archiver lags behind the new named exports
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { isStorageConfigured, getObject } from '@/server/storage';

interface ArchiveLike {
  pipe(dest: PassThrough): void;
  append(source: Buffer, data: { name: string }): void;
  finalize(): Promise<void>;
}

export async function createFolderZipStream(
  folderId: string,
): Promise<{ stream: PassThrough; folderName: string }> {
  const user = await requirePermission('folders:read');

  if (!isStorageConfigured()) {
    throw new Error('Object storage is not configured');
  }

  const folder = await db.folder.findFirst({ where: { id: folderId, deletedAt: null } });
  if (!folder) throw new Error('Folder not found');

  const archive: ArchiveLike = new ZipArchive({ zlib: { level: 5 } });
  const passThrough = new PassThrough();
  archive.pipe(passThrough);

  await addFolderToArchive(archive, folderId, '');

  await logAuditEvent({
    actor: user,
    action: 'file.download',
    targetType: 'folder',
    targetId: folderId,
    meta: { name: folder.name, format: 'zip' },
  });

  archive.finalize();

  return { stream: passThrough, folderName: folder.name };
}

async function addFolderToArchive(
  archive: ArchiveLike,
  folderId: string,
  prefix: string,
): Promise<void> {
  const files = await db.file.findMany({
    where: { folderId, deletedAt: null },
    include: { currentVersion: true },
  });

  for (const file of files) {
    if (!file.currentVersion) continue;
    try {
      const { bytes } = await getObject(file.currentVersion.storageKey);
      archive.append(Buffer.from(bytes), { name: `${prefix}${file.name}` });
    } catch {
      // skip files that fail to download from storage
    }
  }

  const subfolders = await db.folder.findMany({
    where: { parentId: folderId, deletedAt: null },
  });

  for (const sub of subfolders) {
    await addFolderToArchive(archive, sub.id, `${prefix}${sub.name}/`);
  }
}
