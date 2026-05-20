import { db } from '@/server/db';
import { deleteObject, isStorageConfigured } from '@/server/storage';
import {
  getStorageFileHealth,
  getSyncFileHealth,
  type FileHealthReason,
} from '@/server/files/file-health';

export type InvalidFileReport = {
  fileId: string;
  name: string;
  reason: FileHealthReason;
  deletedAt: string | null;
  storageKey: string | null;
  sizeBytes: string | null;
};

export type CleanupScanResult = {
  invalid: InvalidFileReport[];
  scanned: number;
};

export type CleanupExecuteResult = {
  deletedFiles: number;
  deletedVersions: number;
  deletedFavorites: number;
  storageDeletesAttempted: number;
  dryRun: boolean;
};

async function loadFilesForScan(includeTrash: boolean) {
  return db.file.findMany({
    where: includeTrash ? {} : { deletedAt: null },
    include: { currentVersion: true, versions: true },
  });
}

export async function scanInvalidFiles(options?: {
  includeTrash?: boolean;
  checkStorage?: boolean;
}): Promise<CleanupScanResult> {
  const includeTrash = options?.includeTrash ?? true;
  const checkStorage = options?.checkStorage ?? isStorageConfigured();

  const files = await loadFilesForScan(includeTrash);
  const invalid: InvalidFileReport[] = [];

  for (const file of files) {
    let reason = getSyncFileHealth(file);
    if (reason === 'ok' && checkStorage) {
      reason = await getStorageFileHealth(file);
    }
    if (reason === 'ok') continue;

    invalid.push({
      fileId: file.id,
      name: file.name,
      reason,
      deletedAt: file.deletedAt?.toISOString() ?? null,
      storageKey: file.currentVersion?.storageKey ?? file.versions[0]?.storageKey ?? null,
      sizeBytes: file.currentVersion
        ? file.currentVersion.sizeBytes.toString()
        : file.versions[0]
          ? file.versions[0].sizeBytes.toString()
          : null,
    });
  }

  return { invalid, scanned: files.length };
}

export async function cleanupInvalidFiles(dryRun: boolean): Promise<CleanupExecuteResult> {
  const { invalid } = await scanInvalidFiles({ includeTrash: true, checkStorage: true });
  const result: CleanupExecuteResult = {
    deletedFiles: 0,
    deletedVersions: 0,
    deletedFavorites: 0,
    storageDeletesAttempted: 0,
    dryRun,
  };

  if (dryRun || invalid.length === 0) return result;

  for (const row of invalid) {
    const file = await db.file.findUnique({
      where: { id: row.fileId },
      include: { versions: true },
    });
    if (!file) continue;

    if (isStorageConfigured()) {
      for (const v of file.versions) {
        if (v.storageKey?.trim()) {
          result.storageDeletesAttempted++;
          await deleteObject(v.storageKey).catch(() => {});
        }
      }
    }

    const favs = await db.favorite.deleteMany({
      where: { targetType: 'file', targetId: file.id },
    });
    result.deletedFavorites += favs.count;
    result.deletedVersions += file.versions.length;

    await db.file.delete({ where: { id: file.id } });
    result.deletedFiles++;
  }

  return result;
}
