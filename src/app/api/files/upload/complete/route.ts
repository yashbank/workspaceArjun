import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { completeFileUpload } from '@/server/uploads';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileId?: string;
      storageKey?: string;
      sizeBytes?: number;
      mimeType?: string;
      uploadId?: string;
      parts?: { partNumber: number; etag: string }[];
    };

    if (!body.fileId || !body.storageKey || body.sizeBytes == null) {
      return NextResponse.json({ error: 'fileId, storageKey, and sizeBytes are required' }, { status: 400 });
    }

    const result = await completeFileUpload({
      fileId: body.fileId,
      storageKey: body.storageKey,
      sizeBytes: Math.max(0, body.sizeBytes),
      mimeType: body.mimeType || 'application/octet-stream',
      uploadId: body.uploadId,
      parts: body.parts,
    });

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('verification') || msg.includes('Storage')
            ? 502
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
