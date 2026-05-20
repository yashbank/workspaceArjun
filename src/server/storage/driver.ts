import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';

export type StorageDriver = 'local' | 's3';

const S3_REQUIRED_VARS = [
  'STORAGE_ENDPOINT',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
] as const;

export function getDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.toLowerCase();
  if (explicit === 'local') return 'local';
  if (explicit === 's3') return 's3';
  const s3Configured = S3_REQUIRED_VARS.every((v) => !!process.env[v]);
  return s3Configured ? 's3' : 'local';
}

export function getS3Config() {
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
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!,
      secretAccessKey: process.env.STORAGE_SECRET_KEY!,
    },
    bucket: process.env.STORAGE_BUCKET!,
  };
}

let _s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_s3) return _s3;
  const config = getS3Config();
  _s3 = new S3Client({
    endpoint: config.endpoint,
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    credentials: config.credentials,
    forcePathStyle: true,
  });
  return _s3;
}

export function getBucket(): string {
  return getS3Config().bucket;
}

export const LOCAL_ROOT =
  process.env.LOCAL_STORAGE_PATH ??
  path.join(/* turbopackIgnore: true */ process.cwd(), '.local-storage');

export function isStorageConfigured(): boolean {
  if (getDriver() === 'local') return true;
  return S3_REQUIRED_VARS.every((v) => !!process.env[v]);
}

export function getStorageDriverName(): string {
  return getDriver();
}
