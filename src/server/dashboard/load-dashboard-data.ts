import { db } from '@/server/db';
import { getWorkspaceQuotaBytes } from '@/server/settings';
import { fetchRecentActivity, type ActivityListItem } from '@/server/activity';
import type { UserProfile } from '@/generated/prisma/client';

export type DashboardRecentFile = {
  id: string;
  name: string;
  mimeType: string | null;
  updatedAt: Date;
};

export type DashboardActivity = ActivityListItem;

export type DashboardPinnedFile = {
  id: string;
  name: string;
  mimeType: string | null;
};

export type DashboardData = {
  fileCount: number;
  folderCount: number;
  versionCount: number;
  totalBytes: number;
  quotaBytes: number;
  recentFiles: DashboardRecentFile[];
  recentActivity: DashboardActivity[];
  pinnedFileDetails: DashboardPinnedFile[];
};

const EMPTY: DashboardData = {
  fileCount: 0,
  folderCount: 0,
  versionCount: 0,
  totalBytes: 0,
  quotaBytes: 10 * 1024 * 1024 * 1024,
  recentFiles: [],
  recentActivity: [],
  pinnedFileDetails: [],
};

function toNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  try {
    return Number(value);
  } catch {
    return 0;
  }
}

export async function loadDashboardData(profile: UserProfile | null): Promise<DashboardData> {
  const errors: string[] = [];

  const [
    fileCountResult,
    folderCountResult,
    versionCountResult,
    storageResult,
    quotaResult,
    recentFilesResult,
    recentActivityResult,
    pinnedFilesResult,
  ] = await Promise.allSettled([
    db.file.count({ where: { deletedAt: null } }),
    db.folder.count({ where: { deletedAt: null } }),
    db.fileVersion.count(),
    db.storageUsage.findFirst(),
    getWorkspaceQuotaBytes(),
    db.file.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        mimeType: true,
        updatedAt: true,
      },
    }),
    fetchRecentActivity(8),
    profile
      ? db.favorite.findMany({
          where: { userId: profile.id, targetType: 'file' },
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: { targetId: true },
        })
      : Promise.resolve([]),
  ]);

  const fileCount =
    fileCountResult.status === 'fulfilled'
      ? fileCountResult.value
      : (errors.push(`fileCount: ${String(fileCountResult.reason)}`), 0);

  const folderCount =
    folderCountResult.status === 'fulfilled'
      ? folderCountResult.value
      : (errors.push(`folderCount: ${String(folderCountResult.reason)}`), 0);

  const versionCount =
    versionCountResult.status === 'fulfilled'
      ? versionCountResult.value
      : (errors.push(`versionCount: ${String(versionCountResult.reason)}`), 0);

  let totalBytes = 0;
  if (storageResult.status === 'fulfilled' && storageResult.value) {
    totalBytes = toNumber(storageResult.value.totalBytes);
  } else if (storageResult.status === 'rejected') {
    errors.push(`storageUsage: ${String(storageResult.reason)}`);
  }

  let quotaBytes = EMPTY.quotaBytes;
  if (quotaResult.status === 'fulfilled') {
    quotaBytes = Number.isFinite(quotaResult.value) ? quotaResult.value : EMPTY.quotaBytes;
  } else {
    errors.push(`quota: ${String(quotaResult.reason)}`);
  }

  const recentFiles: DashboardRecentFile[] =
    recentFilesResult.status === 'fulfilled'
      ? recentFilesResult.value
          .filter((f) => f.name?.trim())
          .map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            updatedAt: f.updatedAt,
          }))
      : (errors.push(`recentFiles: ${String(recentFilesResult.reason)}`), []);

  const recentActivity: DashboardActivity[] =
    recentActivityResult.status === 'fulfilled'
      ? recentActivityResult.value
      : (errors.push(`recentActivity: ${String(recentActivityResult.reason)}`), []);

  let pinnedFileDetails: DashboardPinnedFile[] = [];
  if (pinnedFilesResult.status === 'fulfilled' && pinnedFilesResult.value.length > 0) {
    const ids = pinnedFilesResult.value.map((p) => p.targetId);
    try {
      const files = await db.file.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, name: true, mimeType: true },
      });
      pinnedFileDetails = files.filter((f) => f.name?.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`pinnedFiles: ${msg}`);
      if (process.env.NODE_ENV === 'development') {
        console.error('[dashboard] pinnedFiles lookup failed:', e);
      }
    }
  } else if (pinnedFilesResult.status === 'rejected') {
    errors.push(`pinnedFiles: ${String(pinnedFilesResult.reason)}`);
  }

  if (errors.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('[dashboard] partial data load:', errors);
  }

  return {
    fileCount,
    folderCount,
    versionCount,
    totalBytes,
    quotaBytes,
    recentFiles,
    recentActivity,
    pinnedFileDetails,
  };
}
