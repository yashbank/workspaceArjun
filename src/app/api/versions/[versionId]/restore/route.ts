import { NextResponse } from 'next/server';
import { restoreVersion } from '@/server/versions';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { versionId } = await params;
    const version = await restoreVersion(versionId);
    return NextResponse.json({ ok: true, versionNo: version.versionNo });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
