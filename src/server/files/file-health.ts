import { headObject, isStorageConfigured } from '@/server/storage';

export type FileHealthReason =
  | 'ok'
  | 'no_version'
  | 'zero_size'
  | 'no_storage_key'
  | 'missing_storage';

export type FileHealthRow = {
  id: string;
  name: string;
  deletedAt: Date | null;
  currentVersionId: string | null;
  currentVersion: {
    id: string;
    sizeBytes: bigint;
    storageKey: string;
  } | null;
};

/** Fast DB-only health check (no storage HEAD). */
export function getSyncFileHealth(file: FileHealthRow): FileHealthReason {
  if (!file.currentVersionId || !file.currentVersion) return 'no_version';
  const key = file.currentVersion.storageKey?.trim();
  if (!key) return 'no_storage_key';
  if (file.currentVersion.sizeBytes <= BigInt(0)) return 'zero_size';
  return 'ok';
}

export function isListableFile(file: FileHealthRow): boolean {
  return getSyncFileHealth(file) === 'ok';
}

export async function getStorageFileHealth(
  file: FileHealthRow,
): Promise<FileHealthReason> {
  const sync = getSyncFileHealth(file);
  if (sync !== 'ok') return sync;
  if (!isStorageConfigured()) return 'ok';

  const head = await headObject(file.currentVersion!.storageKey);
  if (!head.exists || (head.contentLength ?? 0) <= 0) {
    return 'missing_storage';
  }
  return 'ok';
}

export const FILE_CONTENT_MISSING_USER_MESSAGE =
  'File content is missing. Please re-upload this file.';
