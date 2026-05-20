import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { completeVersionUpload } from '@/server/uploads';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      versionNo?: number;
      storageKey?: string;
      sizeBytes?: number;
      mimeType?: string;
      note?: string;
      uploadId?: string;
      parts?: { partNumber: number; etag: string }[];
    };

    if (!body.versionNo || !body.storageKey || !body.sizeBytes) {
      return NextResponse.json(
        { error: 'versionNo, storageKey, and sizeBytes are required' },
        { status: 400 },
      );
    }

    const result = await completeVersionUpload({
      fileId: id,
      versionNo: body.versionNo,
      storageKey: body.storageKey,
      sizeBytes: body.sizeBytes,
      mimeType: body.mimeType || 'application/octet-stream',
      note: body.note,
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
