import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFileStream } from '@/server/files';
import { fileStreamErrorResponse } from '@/server/files/route-errors';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { bytes, contentType, contentLength, fileName } = await getFileStream(id, { audit: false });

    // When the request is version-keyed (`?v=<currentVersionId>`), the content at
    // that URL is immutable (each version has its own stored object), so it can
    // be cached aggressively in the private browser cache. Without the key we
    // keep a short cache, since the same URL can later serve a different version.
    const versioned = request.nextUrl.searchParams.has('v');
    const cacheControl = versioned
      ? 'private, max-age=31536000, immutable'
      : 'private, max-age=60';

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength.toString(),
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': cacheControl,
      },
    });
  } catch (e: unknown) {
    return fileStreamErrorResponse(e);
  }
}
