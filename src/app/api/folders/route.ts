import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listFolders, createFolder } from '@/server/folders';

export async function GET(request: NextRequest) {
  try {
    const parentId = request.nextUrl.searchParams.get('parentId') || null;
    const folders = await listFolders(parentId);
    return NextResponse.json(folders);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, parentId } = body as { name: string; parentId: string | null };
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
    }
    const folder = await createFolder(name, parentId ?? null);
    return NextResponse.json(folder, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
