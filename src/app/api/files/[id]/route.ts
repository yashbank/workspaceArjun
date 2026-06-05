import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { renameFile, softDeleteFile, permanentlyDeleteFile } from '@/server/files';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name } = body as { name: string };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 });
    }
    const file = await renameFile(id, name);
    return NextResponse.json(file);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const permanent = request.nextUrl.searchParams.get('permanent') === 'true';
    if (permanent) {
      await permanentlyDeleteFile(id);
    } else {
      await softDeleteFile(id);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
