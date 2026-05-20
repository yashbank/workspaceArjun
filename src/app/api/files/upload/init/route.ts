import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { initFileUpload } from '@/server/uploads';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      mimeType?: string;
      sizeBytes?: number;
      folderId?: string | null;
    };

    if (!body.name?.trim() || !body.sizeBytes || body.sizeBytes <= 0) {
      return NextResponse.json({ error: 'Valid file name and size are required' }, { status: 400 });
    }

    const result = await initFileUpload({
      name: body.name.trim(),
      mimeType: body.mimeType || 'application/octet-stream',
      sizeBytes: body.sizeBytes,
      folderId: body.folderId ?? null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('limited') || msg.includes('quota') || msg.includes('exceed')
            ? 413
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
