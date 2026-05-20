import { NextResponse } from 'next/server';
import { resendInvite } from '@/server/admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ inviteId: string }> },
) {
  try {
    const { inviteId } = await params;
    await resendInvite(inviteId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
