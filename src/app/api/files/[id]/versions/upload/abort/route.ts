import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { abortVersionUpload } from '@/server/uploads';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params;
    const body = (await request.json()) as {
      storageKey?: string;
      uploadId?: string;
    };

    if (!body.storageKey) {
      return NextResponse.json({ error: 'storageKey is required' }, { status: 400 });
    }

    await abortVersionUpload({
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
