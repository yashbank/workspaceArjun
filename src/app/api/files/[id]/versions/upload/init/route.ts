import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initVersionUpload } from '@/server/uploads';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      mimeType?: string;
      sizeBytes?: number;
    };

    if (!body.sizeBytes || body.sizeBytes <= 0) {
      return NextResponse.json({ error: 'Valid file size is required' }, { status: 400 });
    }

    const result = await initVersionUpload({
      fileId: id,
      mimeType: body.mimeType || 'application/octet-stream',
      sizeBytes: body.sizeBytes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('limited') || msg.includes('quota')
            ? 413
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
