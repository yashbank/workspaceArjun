import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { deleteActivityEvent } from '@/server/activity';

export const dynamic = 'force-dynamic';

/** Owner-only: delete a single activity (audit) event. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { eventId } = await params;
    await deleteActivityEvent(user, eventId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
