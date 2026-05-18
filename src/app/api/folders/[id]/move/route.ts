import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { moveFolder } from '@/server/folders';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { parentId } = (await request.json()) as { parentId: string | null };
    const folder = await moveFolder(id, parentId ?? null);
    return NextResponse.json(folder);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
