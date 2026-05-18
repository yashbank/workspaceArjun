import path from 'path';
import fs from 'fs/promises';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Driver detection
// ---------------------------------------------------------------------------

type StorageDriver = 'local' | 's3';

function getDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.toLowerCase();
  if (explicit === 'local') return 'local';
  if (explicit === 's3') return 's3';
  // Auto-detect: if S3 vars are all present, use s3; otherwise fall back to local
  const s3Configured = S3_REQUIRED_VARS.every((v) => !!process.env[v]);
  return s3Configured ? 's3' : 'local';
}

// ---------------------------------------------------------------------------
// S3 driver (MinIO / IDrive e2 / any S3-compatible)
// ---------------------------------------------------------------------------

const S3_REQUIRED_VARS = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
] as const;

function getS3Config() {
  const missing = S3_REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `S3 storage is not configured. Missing env vars: ${missing.join(', ')}. ` +
        'Set these in .env.local or use STORAGE_DRIVER=local for filesystem mode.',
    );
  }
  return {
    endpoint: process.env.STORAGE_ENDPOINT!,
    region: process.env.STORAGE_REGION!,
    accessKeyId: process.env.STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    bucket: process.env.STORAGE_BUCKET!,
  };
}

let _s3: S3Client | null = null;

function getS3() {
  if (_s3) return _s3;
  const config = getS3Config();
  _s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
  return _s3;
}

function getBucket(): string {
  return getS3Config().bucket;
}

// ---------------------------------------------------------------------------
// Local filesystem driver
// ---------------------------------------------------------------------------

const LOCAL_ROOT = process.env.LOCAL_STORAGE_PATH
  ?? path.join(/* turbopackIgnore: true */ process.cwd(), '.local-storage');

async function localPath(key: string): Promise<string> {
  const full = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  return full;
}

const CONTENT_TYPE_FILE = '.content-type';

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
// Public API — identical interface regardless of driver
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

  await getS3().send(
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

  const response = await getS3().send(
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

  await getS3().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key }),
  );
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
    const res = await getS3().send(
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function buildStorageKey(
  fileId: string,
  versionNo: number,
  filename: string,
): string {
  return `files/${fileId}/v${versionNo}/${filename}`;
}

export function isStorageConfigured(): boolean {
  if (getDriver() === 'local') return true;
  return S3_REQUIRED_VARS.every((v) => !!process.env[v]);
}

export function getStorageDriverName(): string {
  return getDriver();
}
