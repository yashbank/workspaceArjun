import { NextResponse } from 'next/server';

import { isMisForbiddenError } from '@/server/mis/auth';
import { markMisNotificationsRead } from '@/server/mis/notifications';

/** Body: { ids: string[] } — marks the caller's own rows read. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
    await markMisNotificationsRead(ids);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (isMisForbiddenError(err)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
