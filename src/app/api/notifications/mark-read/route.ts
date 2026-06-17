import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { markNotificationsRead } from '@/server/notifications';

/** Marks the given notification ids read for the current user. Body: { ids: string[] }. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((x): x is string => typeof x === 'string')
      : [];
    await markNotificationsRead(user.id, ids);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
