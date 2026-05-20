import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { transferOwnership } from '@/server/admin';

export async function POST(request: NextRequest) {
  try {
    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    await transferOwnership(userId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
