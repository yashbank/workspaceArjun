import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac/permissions';
import { starActivityEvent, unstarActivityEvent } from '@/server/activity';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.role, 'audit:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { eventId } = await params;
    await starActivityEvent(user, eventId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.role, 'audit:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { eventId } = await params;
    await unstarActivityEvent(user, eventId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
