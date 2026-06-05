import { headObject, isStorageConfigured } from '@/server/storage';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Shared DB predicate for a "listable" (valid) file: has a current version
 * whose stored size is greater than zero. This is the single source of truth
 * used to count/list real files across Settings, the Dashboard, and the file
 * browser so they never disagree (e.g. after demo cleanup leaves orphan rows).
 *
 * Callers combine it with `deletedAt: null` (and `folderId`/`id` as needed):
 *   db.file.count({ where: { deletedAt: null, ...LISTABLE_FILE_WHERE } })
 *
 * Note: this mirrors the fast checks in `getSyncFileHealth` that are expressible
 * in SQL. The empty-`storageKey` guard cannot be expressed here, so the
 * authoritative per-row check for listing remains `isListableFile`.
 */
export const LISTABLE_FILE_WHERE = {
  currentVersionId: { not: null },
  currentVersion: { is: { sizeBytes: { gt: 0 } } },
} satisfies Prisma.FileWhereInput;

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
