import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { buildStorageKey, putObject, getObject, headObject } from '@/server/storage';
import type { File, FileVersion } from '@/generated/prisma/client';

export type FileWithVersion = File & {
  currentVersion: FileVersion | null;
  _count: { versions: number };
};

export async function listFiles(folderId: string | null): Promise<FileWithVersion[]> {
  await requirePermission('files:read');
  return db.file.findMany({
    where: { folderId, deletedAt: null },
    include: {
      currentVersion: true,
      _count: { select: { versions: true } },
    },
    orderBy: { name: 'asc' },
  }) as Promise<FileWithVersion[]>;
}

export async function getFile(id: string): Promise<(File & { currentVersion: FileVersion | null }) | null> {
  await requirePermission('files:read');
  return db.file.findFirst({
    where: { id, deletedAt: null },
    include: { currentVersion: true },
  });
}

/**
 * Creates a file record and uploads the binary content to object storage
 * in a single server-side operation. Eliminates browser-to-storage CORS issues.
 */
export async function createFileWithContent(input: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  fileBuffer: Buffer;
}): Promise<{ file: File; storageKey: string }> {
  const user = await requirePermission('files:write');

  if (input.folderId) {
    const folder = await db.folder.findFirst({ where: { id: input.folderId, deletedAt: null } });
    if (!folder) throw new Error('Folder not found');
  }

  const file = await db.file.create({
    data: {
      name: input.name.trim(),
      mimeType: input.mimeType,
      folderId: input.folderId,
      ownerId: user.id,
    },
  });

  const storageKey = buildStorageKey(file.id, 1, input.name.trim());

  try {
    await putObject(storageKey, input.fileBuffer, input.mimeType);
  } catch (storageErr) {
    await db.file.delete({ where: { id: file.id } }).catch(() => {});
    throw new Error(
      `Storage upload failed: ${storageErr instanceof Error ? storageErr.message : 'unknown error'}`,
    );
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    await db.file.delete({ where: { id: file.id } }).catch(() => {});
    throw new Error('Storage verification failed — object not found after upload');
  }

  const version = await db.fileVersion.create({
    data: {
      fileId: file.id,
      versionNo: 1,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey,
      uploadedBy: user.id,
    },
  });

  await db.file.update({
    where: { id: file.id },
    data: { currentVersionId: version.id },
  });

  await db.storageUsage.updateMany({
    data: {
      totalBytes: { increment: BigInt(input.sizeBytes) },
      fileCount: { increment: 1 },
    },
  });

  await logAuditEvent({
    actor: user,
    action: 'file.upload',
    targetType: 'file',
    targetId: file.id,
    meta: { name: input.name, mimeType: input.mimeType, sizeBytes: input.sizeBytes },
  });

  return { file, storageKey };
}

export interface FileStreamResult {
  bytes: Uint8Array;
  contentType: string;
  contentLength: number;
  fileName: string;
}

/**
 * Fetches file content from object storage.
 * Used for both preview (inline) and download (attachment) delivery.
 */
export async function getFileStream(id: string, options?: { audit?: boolean }): Promise<FileStreamResult> {
  const user = await requirePermission('files:read');

  const file = await db.file.findFirst({
    where: { id, deletedAt: null },
    include: { currentVersion: true },
  });
  if (!file || !file.currentVersion) throw new Error('File not found');

  if (options?.audit !== false) {
    await logAuditEvent({
      actor: user,
      action: 'file.download',
      targetType: 'file',
      targetId: id,
      meta: { name: file.name },
    });
  }

  const obj = await getObject(file.currentVersion.storageKey);

  return {
    bytes: obj.bytes,
    contentType: obj.contentType ?? file.mimeType ?? 'application/octet-stream',
    contentLength: obj.bytes.length,
    fileName: file.name,
  };
}

/**
 * Fetches a specific version's content from storage.
 */
export async function getVersionStream(versionId: string): Promise<FileStreamResult> {
  await requirePermission('files:read');

  const version = await db.fileVersion.findUnique({
    where: { id: versionId },
    include: { file: { select: { id: true, name: true, mimeType: true, deletedAt: true } } },
  });
  if (!version || version.file.deletedAt) throw new Error('Version not found');

  const obj = await getObject(version.storageKey);

  return {
    bytes: obj.bytes,
    contentType: obj.contentType ?? version.file.mimeType ?? 'application/octet-stream',
    contentLength: obj.bytes.length,
    fileName: version.file.name,
  };
}

export async function renameFile(id: string, name: string): Promise<File> {
  const user = await requirePermission('files:write');
  const file = await db.file.findFirst({ where: { id, deletedAt: null } });
  if (!file) throw new Error('File not found');

  const updated = await db.file.update({
    where: { id },
    data: { name: name.trim() },
  });

  await logAuditEvent({
    actor: user,
    action: 'file.rename',
    targetType: 'file',
    targetId: id,
    meta: { oldName: file.name, newName: name.trim() },
  });

  return updated;
}

export async function moveFile(id: string, targetFolderId: string | null): Promise<File> {
  const user = await requirePermission('files:write');
  const file = await db.file.findFirst({ where: { id, deletedAt: null } });
  if (!file) throw new Error('File not found');

  if (targetFolderId) {
    const folder = await db.folder.findFirst({ where: { id: targetFolderId, deletedAt: null } });
    if (!folder) throw new Error('Target folder not found');
  }

  const updated = await db.file.update({
    where: { id },
    data: { folderId: targetFolderId },
  });

  await logAuditEvent({
    actor: user,
    action: 'file.move',
    targetType: 'file',
    targetId: id,
    meta: { name: file.name, fromFolder: file.folderId, toFolder: targetFolderId },
  });

  return updated;
}

export async function softDeleteFile(id: string): Promise<void> {
  const user = await requirePermission('files:delete');
  const file = await db.file.findFirst({ where: { id, deletedAt: null } });
  if (!file) throw new Error('File not found');

  await db.file.update({ where: { id }, data: { deletedAt: new Date() } });

  await logAuditEvent({
    actor: user,
    action: 'file.delete',
    targetType: 'file',
    targetId: id,
    meta: { name: file.name },
  });
}
