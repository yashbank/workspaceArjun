import { NextResponse } from 'next/server';
import { STORAGE_CONTENT_MISSING_CODE } from '@/lib/storage-errors';
import { isStorageContentMissingError } from '@/server/files/storage-errors';

export function fileStreamErrorResponse(e: unknown): NextResponse {
  if (isStorageContentMissingError(e)) {
    return NextResponse.json(
      {
        error: e.message,
        code: STORAGE_CONTENT_MISSING_CODE,
        fileId: e.fileId,
        storageKey: e.storageKey,
      },
      { status: 404 },
    );
  }

  const msg = e instanceof Error ? e.message : 'Unknown error';
  if (msg.includes('Object storage is not configured')) {
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
  }
  if (msg === 'File not found' || msg === 'Version not found') {
    return NextResponse.json({ error: msg }, { status: 404 });
  }
  if (msg === 'Unauthorized') {
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  if (msg === 'Forbidden') {
    return NextResponse.json({ error: msg }, { status: 403 });
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}
