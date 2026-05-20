import { NextResponse } from 'next/server';
import { requirePermission } from '@/server/rbac';
import {
  requiresDirectUpload,
  MULTIPART_THRESHOLD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
} from '@/server/storage';
import { getUploadLimits, limitOptionToBytes, UPLOAD_FILE_TYPES } from '@/server/settings/upload-limits';

export async function GET() {
  try {
    await requirePermission('files:read');
    const limits = await getUploadLimits();
    const limitsBytes: Record<string, number | null> = {};
    for (const type of UPLOAD_FILE_TYPES) {
      limitsBytes[type] = limitOptionToBytes(limits[type]);
    }

    return NextResponse.json({
      directUpload: requiresDirectUpload(),
      multipartThresholdBytes: MULTIPART_THRESHOLD_BYTES,
      partSizeBytes: MULTIPART_PART_SIZE_BYTES,
      limits: limitsBytes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
