import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getBreadcrumbs } from '@/server/folders';

export async function GET(request: NextRequest) {
  try {
    const folderId = request.nextUrl.searchParams.get('folderId') || null;
    const crumbs = await getBreadcrumbs(folderId);
    return NextResponse.json(crumbs);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
