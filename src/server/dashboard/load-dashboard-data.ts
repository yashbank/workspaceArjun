import { db } from '@/server/db';
import { getWorkspaceQuotaBytes } from '@/server/settings';
import { fetchRecentActivity, type ActivityListItem } from '@/server/activity';
import { VISIBLE_FILE_WHERE } from '@/server/files/file-health';
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

export type ActivityDayPoint = { date: string; count: number };
export type FileTypeSlice = { key: string; count: number };

export type DashboardData = {
  fileCount: number;
  folderCount: number;
  versionCount: number;
  /** Number of activity events in the last 7 days (a real metric, not list size). */
  activityCount: number;
  totalBytes: number;
  quotaBytes: number;
  recentFiles: DashboardRecentFile[];
  recentActivity: DashboardActivity[];
  pinnedFileDetails: DashboardPinnedFile[];
  /** Owner/admin only — events per day (last 30d) for the activity graph. */
  activityByDay: ActivityDayPoint[];
  /** Owner/admin only — file counts per type category for the pie. */
  fileTypes: FileTypeSlice[];
};

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVITY_GRAPH_DAYS = 30;

const EMPTY: DashboardData = {
  fileCount: 0,
  folderCount: 0,
  versionCount: 0,
  activityCount: 0,
  totalBytes: 0,
  quotaBytes: 10 * 1024 * 1024 * 1024,
  recentFiles: [],
  recentActivity: [],
  pinnedFileDetails: [],
  activityByDay: [],
  fileTypes: [],
};

/** Buckets a file into a coarse type category for the dashboard pie. */
function categorizeFile(name: string, mimeType: string | null): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'heif'].includes(ext))
    return 'image';
  if (ext === 'pdf') return 'pdf';
  if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v', 'avi'].includes(ext)) return 'video';
  if (['cdr', 'ai', 'eps', 'psd'].includes(ext)) return 'design';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt'].includes(ext)) return 'document';
  return 'other';
}

/** Events grouped by UTC day for the last `days` days, zero-filled. */
async function fetchActivityByDay(days = ACTIVITY_GRAPH_DAYS): Promise<ActivityDayPoint[]> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const rows = await db.$queryRaw<{ day: string; count: number }[]>`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
    FROM audit_events
    WHERE created_at >= ${since}
    GROUP BY 1`;
  const map = new Map(rows.map((r) => [r.day, Number(r.count)]));
  const out: ActivityDayPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

/** File counts per type category (capped sample for very large workspaces). */
async function fetchFileTypeDistribution(): Promise<FileTypeSlice[]> {
  const files = await db.file.findMany({
    where: VISIBLE_FILE_WHERE,
    select: { name: true, mimeType: true },
    take: 20000,
  });
  const counts = new Map<string, number>();
  for (const f of files) {
    const key = categorizeFile(f.name ?? '', f.mimeType);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

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

  const activitySince = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  const canSeeAnalytics = profile?.role === 'owner' || profile?.role === 'admin';

  const [
    fileCountResult,
    folderCountResult,
    versionCountResult,
    storageResult,
    quotaResult,
    recentFilesResult,
    recentActivityResult,
    pinnedFilesResult,
    activityCountResult,
    activityByDayResult,
    fileTypesResult,
  ] = await Promise.allSettled([
    db.file.count({ where: VISIBLE_FILE_WHERE }),
    db.folder.count({ where: { deletedAt: null } }),
    db.fileVersion.count({ where: { file: VISIBLE_FILE_WHERE } }),
    db.storageUsage.findFirst(),
    getWorkspaceQuotaBytes(),
    db.file.findMany({
      where: VISIBLE_FILE_WHERE,
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
    db.auditEvent.count({ where: { createdAt: { gte: activitySince } } }),
    canSeeAnalytics ? fetchActivityByDay() : Promise.resolve([]),
    canSeeAnalytics ? fetchFileTypeDistribution() : Promise.resolve([]),
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

  const activityCount =
    activityCountResult.status === 'fulfilled'
      ? activityCountResult.value
      : (errors.push(`activityCount: ${String(activityCountResult.reason)}`), 0);

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
        where: {
          id: { in: ids },
          ...VISIBLE_FILE_WHERE,
        },
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

  const activityByDay: ActivityDayPoint[] =
    activityByDayResult.status === 'fulfilled'
      ? (activityByDayResult.value as ActivityDayPoint[])
      : (errors.push(`activityByDay: ${String(activityByDayResult.reason)}`), []);

  const fileTypes: FileTypeSlice[] =
    fileTypesResult.status === 'fulfilled'
      ? (fileTypesResult.value as FileTypeSlice[])
      : (errors.push(`fileTypes: ${String(fileTypesResult.reason)}`), []);

  if (errors.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('[dashboard] partial data load:', errors);
  }

  return {
    fileCount,
    folderCount,
    versionCount,
    activityCount,
    totalBytes,
    quotaBytes,
    recentFiles,
    recentActivity,
    pinnedFileDetails,
    activityByDay,
    fileTypes,
  };
}
