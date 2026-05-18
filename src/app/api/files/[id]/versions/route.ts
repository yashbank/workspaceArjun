import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listVersions, createNewVersion } from '@/server/versions';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const versions = await listVersions(id);

    const serialized = versions.map((v) => ({
      ...v,
      sizeBytes: v.sizeBytes.toString(),
    }));

    return NextResponse.json(serialized);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 404;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const note = (formData.get('note') as string) || undefined;

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';

    const result = await createNewVersion({
      fileId: id,
      mimeType,
      sizeBytes: file.size,
      note,
      fileBuffer: buffer,
    });

    return NextResponse.json(
      { version: { ...result.version, sizeBytes: result.version.sizeBytes.toString() } },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('Object storage is not configured')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('Storage upload failed') || msg.includes('Storage verification failed')) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
