import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { restoreFile } from '@/server/trash';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await restoreFile(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 404;
    return NextResponse.json({ error: msg }, { status });
  }
}
