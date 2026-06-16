import fs from 'fs/promises';
import path from 'path';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getDriver, getS3Client, getBucket, LOCAL_ROOT } from '@/server/storage/driver';

export { getDriver, isStorageConfigured, getStorageDriverName } from '@/server/storage/driver';
export {
  MULTIPART_THRESHOLD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  PRESIGN_EXPIRY_SECONDS,
  requiresDirectUpload,
  shouldUseMultipart,
  createPresignedPutUrl,
  startMultipartUpload,
  createPresignedPartUrl,
  finishMultipartUpload,
  cancelMultipartUpload,
} from '@/server/storage/s3-upload';

// ---------------------------------------------------------------------------
// Local filesystem helpers
// ---------------------------------------------------------------------------

const CONTENT_TYPE_FILE = '.content-type';

async function localPath(key: string): Promise<string> {
  const full = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  return full;
}

async function writeContentType(key: string, contentType: string): Promise<void> {
  const metaPath = (await localPath(key)) + CONTENT_TYPE_FILE;
  await fs.writeFile(metaPath, contentType, 'utf-8');
}

async function readContentType(key: string): Promise<string | undefined> {
  try {
    const metaPath = (await localPath(key)) + CONTENT_TYPE_FILE;
    return (await fs.readFile(metaPath, 'utf-8')).trim();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  if (getDriver() === 'local') {
    const filePath = await localPath(key);
    await fs.writeFile(filePath, body);
    await writeContentType(key, contentType);
    return;
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<{
  bytes: Uint8Array;
  contentType: string | undefined;
  contentLength: number | undefined;
}> {
  if (getDriver() === 'local') {
    const filePath = await localPath(key);
    const bytes = await fs.readFile(filePath);
    const contentType = await readContentType(key);
    return { bytes, contentType, contentLength: bytes.length };
  }

  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!response.Body) {
    throw new Error('Empty response body from storage');
  }
  const bytes = await response.Body.transformToByteArray();
  return {
    bytes,
    contentType: response.ContentType ?? undefined,
    contentLength: response.ContentLength ? Number(response.ContentLength) : undefined,
  };
}

export async function deleteObject(key: string): Promise<void> {
  if (getDriver() === 'local') {
    const filePath = await localPath(key);
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(filePath + CONTENT_TYPE_FILE).catch(() => {});
    return;
  }

  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
}

// Batch delete many objects in one go. S3 uses DeleteObjects (≤1000 keys/call);
// local deletes in bounded-parallel batches. Best-effort like deleteObject: a
// failed key leaves a reclaimable orphan, it never throws — callers rely on this
// so a storage hiccup can't roll back an already-committed DB delete.
const S3_DELETE_BATCH = 1000;
const LOCAL_DELETE_CONCURRENCY = 16;

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  if (getDriver() === 'local') {
    for (let i = 0; i < keys.length; i += LOCAL_DELETE_CONCURRENCY) {
      const slice = keys.slice(i, i + LOCAL_DELETE_CONCURRENCY);
      await Promise.all(
        slice.map(async (key) => {
          const filePath = await localPath(key);
          await fs.unlink(filePath).catch(() => {});
          await fs.unlink(filePath + CONTENT_TYPE_FILE).catch(() => {});
        }),
      );
    }
    return;
  }

  const client = getS3Client();
  const bucket = getBucket();
  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH) {
    const slice = keys.slice(i, i + S3_DELETE_BATCH);
    try {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: slice.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch {
      // Best-effort: leave reclaimable orphans rather than fail the operation.
    }
  }
}

export async function headObject(
  key: string,
): Promise<{ exists: boolean; contentLength?: number }> {
  if (getDriver() === 'local') {
    try {
      const filePath = await localPath(key);
      const stat = await fs.stat(filePath);
      return { exists: true, contentLength: stat.size };
    } catch {
      return { exists: false };
    }
  }

  try {
    const res = await getS3Client().send(
      new HeadObjectCommand({ Bucket: getBucket(), Key: key }),
    );
    return {
      exists: true,
      contentLength: res.ContentLength ? Number(res.ContentLength) : undefined,
    };
  } catch {
    return { exists: false };
  }
}

export function buildStorageKey(
  fileId: string,
  versionNo: number,
  filename: string,
): string {
  return `files/${fileId}/v${versionNo}/${filename}`;
}
