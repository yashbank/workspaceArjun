import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessBlockedError, accessBlockedResponse } from '@/lib/api-error';
import { bulkSoftDeleteFiles, bulkMoveFiles } from '@/server/files';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: 'delete' | 'move';
      fileIds?: string[];
      targetFolderId?: string | null;
    };
    const fileIds = body.fileIds ?? [];

    if (!body.action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }
    if (fileIds.length === 0) {
      return NextResponse.json({ error: 'No files selected' }, { status: 400 });
    }

    if (body.action === 'delete') {
      const result = await bulkSoftDeleteFiles(fileIds);
      return NextResponse.json(result);
    }
    if (body.action === 'move') {
      const result = await bulkMoveFiles(fileIds, body.targetFolderId ?? null);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
