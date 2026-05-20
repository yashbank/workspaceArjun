import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFileStream } from '@/server/files';
import { fileStreamErrorResponse } from '@/server/files/route-errors';

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
    return fileStreamErrorResponse(e);
  }
}
