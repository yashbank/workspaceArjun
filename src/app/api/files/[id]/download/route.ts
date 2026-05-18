import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFileStream } from '@/server/files';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { bytes, contentType, contentLength, fileName } = await getFileStream(id, { audit: true });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('Object storage is not configured')) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 });
    }
    if (msg.includes('NoSuchKey') || msg.includes('not found') || msg.includes('Not Found')) {
      return NextResponse.json({ error: 'File content not found in storage' }, { status: 404 });
    }
    if (msg.includes('Empty response body')) {
      return NextResponse.json({ error: 'File is empty or missing from storage' }, { status: 404 });
    }
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
