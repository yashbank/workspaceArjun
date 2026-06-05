import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFileStream } from '@/server/files';
import { fileStreamErrorResponse } from '@/server/files/route-errors';
import { getExtension } from '@/lib/file-utils';
import {
  isThumbnailable,
  generateThumbnail,
  MAX_THUMBNAIL_INPUT_BYTES,
} from '@/server/files/thumbnail';

const DEFAULT_WIDTH = 256;
const MIN_WIDTH = 32;
const MAX_WIDTH = 512;

function parseWidth(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
}

/**
 * Optimized thumbnail endpoint. Streams a small WebP for raster images, reusing
 * `getFileStream` so it's protected by the same `files:read` permission and
 * always serves the file's current version. Version-keyed requests (`?v=`) are
 * immutable and cached aggressively. Unsupported / too-large / corrupt inputs
 * return a graceful error status so the client can fall back to the preview.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const width = parseWidth(request.nextUrl.searchParams.get('w'));
    const versioned = request.nextUrl.searchParams.has('v');

    // Permission check + current-version bytes (no audit event for thumbnails).
    const { bytes, fileName } = await getFileStream(id, { audit: false });

    if (!isThumbnailable(getExtension(fileName))) {
      return NextResponse.json(
        { error: 'Unsupported image type for thumbnail' },
        { status: 415 },
      );
    }
    if (bytes.length > MAX_THUMBNAIL_INPUT_BYTES) {
      return NextResponse.json({ error: 'Image too large for thumbnail' }, { status: 413 });
    }

    let webp: Buffer;
    try {
      webp = await generateThumbnail(bytes, width);
    } catch {
      return NextResponse.json({ error: 'Could not generate thumbnail' }, { status: 422 });
    }

    return new NextResponse(new Uint8Array(webp), {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': webp.length.toString(),
        'Cache-Control': versioned
          ? 'private, max-age=31536000, immutable'
          : 'private, max-age=60',
      },
    });
  } catch (e: unknown) {
    return fileStreamErrorResponse(e);
  }
}
