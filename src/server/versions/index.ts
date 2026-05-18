import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { buildStorageKey, putObject, headObject } from '@/server/storage';
import type { FileVersion } from '@/generated/prisma/client';

export type VersionWithUploader = FileVersion & {
  uploader: { id: string; email: string; name: string | null };
};

/**
 * Lists all versions of a file, newest first.
 */
export async function listVersions(fileId: string): Promise<VersionWithUploader[]> {
  await requirePermission('versions:read');

  const file = await db.file.findFirst({ where: { id: fileId, deletedAt: null } });
  if (!file) throw new Error('File not found');

  return db.fileVersion.findMany({
    where: { fileId },
    include: { uploader: { select: { id: true, email: true, name: true } } },
    orderBy: { versionNo: 'desc' },
  });
}

/**
 * Creates a new version, uploads the binary to storage server-side,
 * and sets it as the current version.
 */
export async function createNewVersion(input: {
  fileId: string;
  mimeType: string;
  sizeBytes: number;
  note?: string;
  fileBuffer: Buffer;
}): Promise<{ version: FileVersion }> {
  const user = await requirePermission('files:write');

  const file = await db.file.findFirst({
    where: { id: input.fileId, deletedAt: null },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
  if (!file) throw new Error('File not found');

  const nextVersionNo = (file.versions[0]?.versionNo ?? 0) + 1;
  const storageKey = buildStorageKey(file.id, nextVersionNo, file.name);

  await putObject(storageKey, input.fileBuffer, input.mimeType);

  const head = await headObject(storageKey);
  if (!head.exists) {
    throw new Error('Storage verification failed — object not found after upload');
  }

  const version = await db.fileVersion.create({
    data: {
      fileId: file.id,
      versionNo: nextVersionNo,
      sizeBytes: BigInt(input.sizeBytes),
      storageKey,
      uploadedBy: user.id,
      note: input.note?.trim() || null,
    },
  });

  await db.file.update({
    where: { id: file.id },
    data: { currentVersionId: version.id, mimeType: input.mimeType },
  });

  await db.storageUsage.updateMany({
    data: { totalBytes: { increment: BigInt(input.sizeBytes) } },
  });

  await logAuditEvent({
    actor: user,
    action: 'version.upload',
    targetType: 'file',
    targetId: file.id,
    meta: {
      versionNo: nextVersionNo,
      sizeBytes: input.sizeBytes,
      note: input.note ?? null,
      fileName: file.name,
    },
  });

  return { version };
}

/**
 * Restores an older version by setting it as the current version.
 * Does not delete any history — the restored version simply becomes current.
 */
export async function restoreVersion(versionId: string): Promise<FileVersion> {
  const user = await requirePermission('versions:restore');

  const version = await db.fileVersion.findUnique({
    where: { id: versionId },
    include: { file: { select: { id: true, name: true, deletedAt: true, currentVersionId: true } } },
  });
  if (!version || version.file.deletedAt) throw new Error('Version not found');

  if (version.file.currentVersionId === versionId) {
    throw new Error('This version is already the current version');
  }

  await db.file.update({
    where: { id: version.file.id },
    data: { currentVersionId: versionId },
  });

  await logAuditEvent({
    actor: user,
    action: 'version.restore',
    targetType: 'file',
    targetId: version.file.id,
    meta: {
      fileName: version.file.name,
      restoredVersionNo: version.versionNo,
      versionId,
    },
  });

  return version;
}

