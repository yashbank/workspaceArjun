import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import {
  buildStorageKey,
  putObject,
  getObject,
  headObject,
  deleteObject,
  isStorageConfigured,
} from '@/server/storage';
import {
  StorageContentMissingError,
  logMissingStorageObject,
} from '@/server/files/storage-errors';
import { isListableFile } from '@/server/files/file-health';
import { folderNameOrRoot } from '@/server/folders';
import type { File, FileVersion } from '@/generated/prisma/client';

export type FileWithVersion = File & {
  currentVersion: FileVersion | null;
  _count: { versions: number };
};

const FILES_LIST_LIMIT = 500;

export async function listFiles(folderId: string | null): Promise<FileWithVersion[]> {
  await requirePermission('files:read');
  const rows = await db.file.findMany({
    where: { folderId, deletedAt: null },
    include: {
      currentVersion: true,
      _count: { select: { versions: true } },
    },
    orderBy: { name: 'asc' },
    take: FILES_LIST_LIMIT,
  });
  return rows.filter(isListableFile) as FileWithVersion[];
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

  const storageKey = file.currentVersion.storageKey;
  if (!storageKey?.trim()) {
    logMissingStorageObject('getFileStream', { fileId: id, storageKey: null });
    throw new StorageContentMissingError(id, null);
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    logMissingStorageObject('getFileStream', {
      fileId: id,
      storageKey,
      versionId: file.currentVersion.id,
    });
    throw new StorageContentMissingError(id, storageKey);
  }

  if (options?.audit !== false) {
    await logAuditEvent({
      actor: user,
      action: 'file.download',
      targetType: 'file',
      targetId: id,
      meta: { name: file.name },
    });
  }

  let obj;
  try {
    obj = await getObject(storageKey);
  } catch (err) {
    logMissingStorageObject('getFileStream.read', {
      fileId: id,
      storageKey,
      versionId: file.currentVersion.id,
    });
    if (err instanceof Error && err.message.includes('Empty response body')) {
      throw new StorageContentMissingError(id, storageKey);
    }
    throw err;
  }

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

  const storageKey = version.storageKey;
  if (!storageKey?.trim()) {
    logMissingStorageObject('getVersionStream', {
      fileId: version.file.id,
      storageKey: null,
      versionId: version.id,
    });
    throw new StorageContentMissingError(version.file.id, null);
  }

  const head = await headObject(storageKey);
  if (!head.exists) {
    logMissingStorageObject('getVersionStream', {
      fileId: version.file.id,
      storageKey,
      versionId: version.id,
    });
    throw new StorageContentMissingError(version.file.id, storageKey);
  }

  let obj;
  try {
    obj = await getObject(storageKey);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Empty response body')) {
      throw new StorageContentMissingError(version.file.id, storageKey);
    }
    throw err;
  }

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

  let toName = 'Root';
  if (targetFolderId) {
    const folder = await db.folder.findFirst({
      where: { id: targetFolderId, deletedAt: null },
      select: { name: true },
    });
    if (!folder) throw new Error('Target folder not found');
    toName = folder.name;
  }
  const fromName = await folderNameOrRoot(file.folderId);

  const updated = await db.file.update({
    where: { id },
    data: { folderId: targetFolderId },
  });

  await logAuditEvent({
    actor: user,
    action: 'file.move',
    targetType: 'file',
    targetId: id,
    meta: {
      name: file.name,
      fromFolder: file.folderId,
      toFolder: targetFolderId,
      fromName,
      toName,
    },
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

/**
 * Permanently removes a file (and every version) regardless of trash state.
 * Storage blobs are deleted best-effort and storage usage is decremented.
 * Gated by `files:permanent_delete` (owner only) — the "Delete permanently"
 * action surfaced in the file browser.
 */
export async function permanentlyDeleteFile(id: string): Promise<void> {
  const user = await requirePermission('files:permanent_delete');
  const file = await db.file.findUnique({
    where: { id },
    include: { versions: true },
  });
  if (!file) throw new Error('File not found');

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
