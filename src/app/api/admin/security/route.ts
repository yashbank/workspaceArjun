import { NextResponse } from 'next/server';
import { listAccessOverview } from '@/server/access/admin';

export async function GET() {
  try {
    const data = await listAccessOverview();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
