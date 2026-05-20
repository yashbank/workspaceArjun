import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { getWorkspaceQuotaBytes } from '@/server/settings';
import {
  assertFileSizeWithinLimit,
  getFileTypeFromName,
  getMaxUploadBytesForFile,
} from '@/server/settings/upload-limits';
import {
  buildStorageKey,
  headObject,
  deleteObject,
  requiresDirectUpload,
  shouldUseMultipart,
  createPresignedPutUrl,
  startMultipartUpload,
  createPresignedPartUrl,
  finishMultipartUpload,
  cancelMultipartUpload,
  MULTIPART_PART_SIZE_BYTES,
} from '@/server/storage';

const PROXY_MAX_BYTES = 4 * 1024 * 1024; // Vercel-safe proxy limit for local dev

/** Prefer client size; fall back to storage HEAD when iOS reports 0 or size mismatches. */
async function resolveUploadedSizeBytes(
  storageKey: string,
  clientSizeBytes: number,
): Promise<number> {
  const head = await headObject(storageKey);
  if (!head.exists) {
    throw new Error('Storage verification failed — object not found after upload');
  }

  const stored = head.contentLength ?? 0;
  if (stored > 0) {
    if (clientSizeBytes > 0 && clientSizeBytes !== stored) {
      console.warn('[upload] size mismatch — using storage ContentLength', {
        storageKey,
        clientSizeBytes,
        stored,
      });
    }
    return stored;
  }

  if (clientSizeBytes > 0) return clientSizeBytes;

  throw new Error('Uploaded file is empty or size could not be verified');
}

export type UploadInitResponse = {
  mode: 'direct' | 'proxy';
  fileId: string;
  storageKey: string;
  method: 'single' | 'multipart';
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
};

export type VersionUploadInitResponse = {
  mode: 'direct' | 'proxy';
  fileId: string;
  versionNo: number;
  storageKey: string;
  method: 'single' | 'multipart';
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
};

async function assertWorkspaceQuota(additionalBytes: number): Promise<void> {
  const quota = await getWorkspaceQuotaBytes();
  const usage = await db.storageUsage.findFirst();
  const used = usage ? Number(usage.totalBytes) : 0;
  if (used + additionalBytes > quota) {
    throw new Error('Workspace storage quota exceeded. Free space or contact the owner.');
  }
}

async function validateUpload(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): Promise<void> {
  if (!filename.trim()) throw new Error('Filename is required');
  if (sizeBytes <= 0) throw new Error('File is empty');

  const fileType = getFileTypeFromName(filename, mimeType);
  const maxBytes = await getMaxUploadBytesForFile(filename, mimeType);
  assertFileSizeWithinLimit(sizeBytes, filename, maxBytes, fileType);

  if (!requiresDirectUpload() && sizeBytes > PROXY_MAX_BYTES) {
    throw new Error(
      `Files over ${PROXY_MAX_BYTES / (1024 * 1024)} MB require S3 storage. Set STORAGE_DRIVER=s3 for large uploads.`,
    );
  }

  await assertWorkspaceQuota(sizeBytes);
}

export async function initFileUpload(input: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
}): Promise<UploadInitResponse> {
  const user = await requirePermission('files:write');
  await validateUpload(input.name, input.mimeType, input.sizeBytes);

  if (input.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: input.folderId, deletedAt: null },
    });
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

  if (!requiresDirectUpload()) {
    return {
      mode: 'proxy',
      fileId: file.id,
      storageKey,
      method: 'single',
    };
  }

  try {
    if (shouldUseMultipart(input.sizeBytes)) {
      const uploadId = await startMultipartUpload(storageKey, input.mimeType);
      return {
        mode: 'direct',
        fileId: file.id,
        storageKey,
        method: 'multipart',
        uploadId,
        partSize: MULTIPART_PART_SIZE_BYTES,
      };
    }

    const uploadUrl = await createPresignedPutUrl(storageKey, input.mimeType);
    return {
      mode: 'direct',
      fileId: file.id,
      storageKey,
      method: 'single',
      uploadUrl,
    };
  } catch (err) {
    await db.file.delete({ where: { id: file.id } }).catch(() => {});
    throw err;
  }
}

export async function getFileUploadPartUrl(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
}): Promise<string> {
  await requirePermission('files:write');
  if (input.partNumber < 1 || input.partNumber > 10_000) {
    throw new Error('Invalid part number');
  }
  return createPresignedPartUrl(input.storageKey, input.uploadId, input.partNumber);
}

export async function completeFileUpload(input: {
  fileId: string;
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
}): Promise<{ fileId: string }> {
  const user = await requirePermission('files:write');

  const file = await db.file.findFirst({
    where: { id: input.fileId, deletedAt: null },
  });
  if (!file) throw new Error('File not found');

  try {
    if (input.uploadId && input.parts?.length) {
      await finishMultipartUpload(input.storageKey, input.uploadId, input.parts);
    }

    const sizeBytes = await resolveUploadedSizeBytes(input.storageKey, input.sizeBytes);

    const version = await db.fileVersion.create({
      data: {
        fileId: file.id,
        versionNo: 1,
        sizeBytes: BigInt(sizeBytes),
        storageKey: input.storageKey,
        uploadedBy: user.id,
      },
    });

    await db.file.update({
      where: { id: file.id },
      data: { currentVersionId: version.id },
    });

    await db.storageUsage.updateMany({
      data: {
        totalBytes: { increment: BigInt(sizeBytes) },
        fileCount: { increment: 1 },
      },
    });

    await logAuditEvent({
      actor: user,
      action: 'file.upload',
      targetType: 'file',
      targetId: file.id,
      meta: {
        name: file.name,
        mimeType: input.mimeType,
        sizeBytes,
        folderId: file.folderId,
      },
    });

    return { fileId: file.id };
  } catch (err) {
    await deleteObject(input.storageKey).catch(() => {});
    await db.file.delete({ where: { id: file.id } }).catch(() => {});
    throw err;
  }
}

export async function abortFileUpload(input: {
  fileId: string;
  storageKey: string;
  uploadId?: string;
}): Promise<void> {
  await requirePermission('files:write');

  if (input.uploadId) {
    await cancelMultipartUpload(input.storageKey, input.uploadId).catch(() => {});
  }
  await deleteObject(input.storageKey).catch(() => {});
  await db.file.delete({ where: { id: input.fileId } }).catch(() => {});
}

export async function initVersionUpload(input: {
  fileId: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<VersionUploadInitResponse> {
  await requirePermission('files:write');

  const file = await db.file.findFirst({
    where: { id: input.fileId, deletedAt: null },
    include: { versions: { orderBy: { versionNo: 'desc' }, take: 1 } },
  });
  if (!file) throw new Error('File not found');

  await validateUpload(file.name, input.mimeType, input.sizeBytes);

  const versionNo = (file.versions[0]?.versionNo ?? 0) + 1;
  const storageKey = buildStorageKey(file.id, versionNo, file.name);

  if (!requiresDirectUpload()) {
    return {
      mode: 'proxy',
      fileId: file.id,
      versionNo,
      storageKey,
      method: 'single',
    };
  }

  if (shouldUseMultipart(input.sizeBytes)) {
    const uploadId = await startMultipartUpload(storageKey, input.mimeType);
    return {
      mode: 'direct',
      fileId: file.id,
      versionNo,
      storageKey,
      method: 'multipart',
      uploadId,
      partSize: MULTIPART_PART_SIZE_BYTES,
    };
  }

  const uploadUrl = await createPresignedPutUrl(storageKey, input.mimeType);
  return {
    mode: 'direct',
    fileId: file.id,
    versionNo,
    storageKey,
    method: 'single',
    uploadUrl,
  };
}

export async function getVersionUploadPartUrl(input: {
  storageKey: string;
  uploadId: string;
  partNumber: number;
}): Promise<string> {
  return getFileUploadPartUrl(input);
}

export async function completeVersionUpload(input: {
  fileId: string;
  versionNo: number;
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  note?: string;
  uploadId?: string;
  parts?: { partNumber: number; etag: string }[];
}): Promise<{ versionId: string }> {
  const user = await requirePermission('files:write');

  const file = await db.file.findFirst({
    where: { id: input.fileId, deletedAt: null },
  });
  if (!file) throw new Error('File not found');

  try {
    if (input.uploadId && input.parts?.length) {
      await finishMultipartUpload(input.storageKey, input.uploadId, input.parts);
    }

    const sizeBytes = await resolveUploadedSizeBytes(input.storageKey, input.sizeBytes);

    const version = await db.fileVersion.create({
      data: {
        fileId: file.id,
        versionNo: input.versionNo,
        sizeBytes: BigInt(sizeBytes),
        storageKey: input.storageKey,
        uploadedBy: user.id,
        note: input.note?.trim() || null,
      },
    });

    await db.file.update({
      where: { id: file.id },
      data: { currentVersionId: version.id, mimeType: input.mimeType },
    });

    await db.storageUsage.updateMany({
      data: { totalBytes: { increment: BigInt(sizeBytes) } },
    });

    await logAuditEvent({
      actor: user,
      action: 'version.upload',
      targetType: 'file',
      targetId: file.id,
      meta: {
        versionNo: input.versionNo,
        sizeBytes,
        note: input.note ?? null,
        fileName: file.name,
      },
    });

    return { versionId: version.id };
  } catch (err) {
    await deleteObject(input.storageKey).catch(() => {});
    throw err;
  }
}

export async function abortVersionUpload(input: {
  storageKey: string;
  uploadId?: string;
}): Promise<void> {
  await requirePermission('files:write');
  if (input.uploadId) {
    await cancelMultipartUpload(input.storageKey, input.uploadId).catch(() => {});
  }
  await deleteObject(input.storageKey).catch(() => {});
}
