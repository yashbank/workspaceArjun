import { NextResponse } from 'next/server';
import { STORAGE_CONTENT_MISSING_CODE } from '@/lib/storage-errors';
import { isStorageContentMissingError } from '@/server/files/storage-errors';
import {
  isAccessBlockedError,
  ACCESS_BLOCKED_MESSAGE,
  ACCESS_BLOCKED_CODE,
} from '@/server/access/errors';

export function fileStreamErrorResponse(e: unknown): NextResponse {
  if (isAccessBlockedError(e)) {
    return NextResponse.json(
      { error: ACCESS_BLOCKED_MESSAGE, code: ACCESS_BLOCKED_CODE },
      { status: 403 },
    );
  }
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
