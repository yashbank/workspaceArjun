import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkDuplicateFileName } from '@/server/search';

export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get('name') ?? '';
    const folderId = request.nextUrl.searchParams.get('folderId') || null;
    if (!name.trim()) {
      return NextResponse.json({ exists: false });
    }
    const result = await checkDuplicateFileName(name, folderId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
