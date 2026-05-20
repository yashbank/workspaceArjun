import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getDriver, getS3Client, getBucket } from '@/server/storage/driver';

export const MULTIPART_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const PRESIGN_EXPIRY_SECONDS = 3600;

export function requiresDirectUpload(): boolean {
  return getDriver() === 's3';
}

export function shouldUseMultipart(sizeBytes: number): boolean {
  return sizeBytes >= MULTIPART_THRESHOLD_BYTES;
}

/**
 * Presigned PUT without Content-Type in the signature.
 * iOS Safari often sends a different Content-Type than reported at pick time;
 * binding Content-Type in the signature causes 403 Forbidden on PUT.
 * The client still sends a normalized Content-Type header for object metadata.
 */
export async function createPresignedPutUrl(
  key: string,
  _contentType: string,
  expiresIn = PRESIGN_EXPIRY_SECONDS,
): Promise<string> {
  if (getDriver() !== 's3') {
    throw new Error('Presigned uploads require S3 storage (STORAGE_DRIVER=s3)');
  }
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function startMultipartUpload(
  key: string,
  contentType: string,
): Promise<string> {
  if (getDriver() !== 's3') {
    throw new Error('Multipart uploads require S3 storage (STORAGE_DRIVER=s3)');
  }
  const res = await getS3Client().send(
    new CreateMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      ContentType: contentType,
    }),
  );
  if (!res.UploadId) throw new Error('Failed to start multipart upload');
  return res.UploadId;
}

export async function createPresignedPartUrl(
  key: string,
  uploadId: string,
  partNumber: number,
  expiresIn = PRESIGN_EXPIRY_SECONDS,
): Promise<string> {
  const command = new UploadPartCommand({
    Bucket: getBucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export async function finishMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  await getS3Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function cancelMultipartUpload(key: string, uploadId: string): Promise<void> {
  await getS3Client().send(
    new AbortMultipartUploadCommand({
      Bucket: getBucket(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}
