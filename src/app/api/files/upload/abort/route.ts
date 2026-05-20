import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { abortFileUpload } from '@/server/uploads';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      fileId?: string;
      storageKey?: string;
      uploadId?: string;
    };

    if (!body.fileId || !body.storageKey) {
      return NextResponse.json({ error: 'fileId and storageKey are required' }, { status: 400 });
    }

    await abortFileUpload({
      fileId: body.fileId,
      storageKey: body.storageKey,
      uploadId: body.uploadId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
