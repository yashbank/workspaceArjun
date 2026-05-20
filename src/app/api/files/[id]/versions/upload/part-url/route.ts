import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getVersionUploadPartUrl } from '@/server/uploads';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await params;
    const body = (await request.json()) as {
      storageKey?: string;
      uploadId?: string;
      partNumber?: number;
    };

    if (!body.storageKey || !body.uploadId || !body.partNumber) {
      return NextResponse.json({ error: 'storageKey, uploadId, and partNumber are required' }, { status: 400 });
    }

    const url = await getVersionUploadPartUrl({
      storageKey: body.storageKey,
      uploadId: body.uploadId,
      partNumber: body.partNumber,
    });

    return NextResponse.json({ url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
