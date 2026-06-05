import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import {
  getFileSizeCapBytes,
  getVersionRetentionCount,
  getWorkspaceQuotaBytes,
  setSetting,
} from '@/server/settings';
import {
  getUploadLimits,
  setUploadLimits,
  UPLOAD_FILE_TYPES,
  UPLOAD_LIMIT_OPTIONS,
  type UploadLimitsConfig,
} from '@/server/settings/upload-limits';
import { LISTABLE_FILE_WHERE } from '@/server/files/file-health';

export async function GET() {
  try {
    await requirePermission('settings:manage');

    const [totalFiles, totalFolders, totalVersions, storageRow, fileSizeCap, versionRetention, quota, uploadLimits] =
      await Promise.all([
        db.file.count({ where: { deletedAt: null, ...LISTABLE_FILE_WHERE } }),
        db.folder.count({ where: { deletedAt: null } }),
        db.fileVersion.count({ where: { file: { deletedAt: null, ...LISTABLE_FILE_WHERE } } }),
        db.storageUsage.findFirst(),
        getFileSizeCapBytes(),
        getVersionRetentionCount(),
        getWorkspaceQuotaBytes(),
        getUploadLimits(),
      ]);

    return NextResponse.json({
      totalFiles,
      totalFolders,
      totalVersions,
      storageUsedBytes: storageRow ? Number(storageRow.totalBytes) : 0,
      fileSizeCapBytes: fileSizeCap,
      versionRetentionCount: versionRetention,
      workspaceQuotaBytes: quota,
      uploadLimits,
      uploadLimitOptions: UPLOAD_LIMIT_OPTIONS,
      uploadFileTypes: UPLOAD_FILE_TYPES,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requirePermission('settings:manage');
    const body = (await request.json()) as Record<string, unknown>;

    const updates: string[] = [];

    if (body.fileSizeCapBytes !== undefined) {
      const val = Number(body.fileSizeCapBytes);
      if (isNaN(val) || val < 1_048_576) {
        return NextResponse.json({ error: 'Min file size cap is 1 MB' }, { status: 400 });
      }
      await setSetting('file_size_cap_bytes', String(val));
      updates.push('file_size_cap_bytes');
    }

    if (body.versionRetentionCount !== undefined) {
      const val = Number(body.versionRetentionCount);
      if (isNaN(val) || val < 1) {
        return NextResponse.json({ error: 'Min retention count is 1' }, { status: 400 });
      }
      await setSetting('version_retention_count', String(val));
      updates.push('version_retention_count');
    }

    if (body.uploadLimits !== undefined) {
      const limits = body.uploadLimits as UploadLimitsConfig;
      await setUploadLimits(limits);
      updates.push('upload_limits_json');
    }

    if (updates.length > 0) {
      await logAuditEvent({
        actor,
        action: 'settings.change',
        targetType: 'workspace',
        meta: { fields: updates, ...body },
      });
    }

    return NextResponse.json({ ok: true, updated: updates });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
