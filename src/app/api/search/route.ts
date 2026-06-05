import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessBlockedError, accessBlockedResponse } from '@/lib/api-error';
import { searchFiles } from '@/server/search';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q') ?? '';
    const results = await searchFiles(q);
    return NextResponse.json(results);
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
