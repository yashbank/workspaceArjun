import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { bulkRestoreTrash, bulkPermanentDeleteTrash } from '@/server/trash';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action?: 'restore' | 'permanent_delete';
      folderIds?: string[];
      fileIds?: string[];
    };

    const folderIds = body.folderIds ?? [];
    const fileIds = body.fileIds ?? [];

    if (!body.action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }
    if (folderIds.length === 0 && fileIds.length === 0) {
      return NextResponse.json({ error: 'No items selected' }, { status: 400 });
    }

    if (body.action === 'restore') {
      const result = await bulkRestoreTrash({ folderIds, fileIds });
      return NextResponse.json(result);
    }

    if (body.action === 'permanent_delete') {
      const result = await bulkPermanentDeleteTrash({ folderIds, fileIds });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
