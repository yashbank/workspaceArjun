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

export async function GET() {
  try {
    await requirePermission('settings:manage');

    const [totalFiles, totalFolders, totalVersions, storageRow, fileSizeCap, versionRetention, quota] =
      await Promise.all([
        db.file.count({ where: { deletedAt: null } }),
        db.folder.count({ where: { deletedAt: null } }),
        db.fileVersion.count(),
        db.storageUsage.findFirst(),
        getFileSizeCapBytes(),
        getVersionRetentionCount(),
        getWorkspaceQuotaBytes(),
      ]);

    return NextResponse.json({
      totalFiles,
      totalFolders,
      totalVersions,
      storageUsedBytes: storageRow ? Number(storageRow.totalBytes) : 0,
      fileSizeCapBytes: fileSizeCap,
      versionRetentionCount: versionRetention,
      workspaceQuotaBytes: quota,
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
