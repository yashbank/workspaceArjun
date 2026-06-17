import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { revealUserAccessCode } from '@/server/access/admin';

/** Owner-only: reveal (and lazily create) a member's access code. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { code } = await revealUserAccessCode(id);
    return NextResponse.json({ code });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('not found')
            ? 404
            : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
