import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { moveFile } from '@/server/files';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { folderId } = (await request.json()) as { folderId: string | null };
    const file = await moveFile(id, folderId ?? null);
    return NextResponse.json(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
