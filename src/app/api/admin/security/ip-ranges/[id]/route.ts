import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { removeAllowedIpRange } from '@/server/access/admin';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await removeAllowedIpRange(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('not found')
            ? 404
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
