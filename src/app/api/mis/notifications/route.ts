import { NextResponse } from 'next/server';

import { isMisForbiddenError } from '@/server/mis/auth';
import { listMisNotifications } from '@/server/mis/notifications';

/** The bell's unread list for the signed-in Owner / Admin / Store Guy. */
export async function GET() {
  try {
    return NextResponse.json({ items: await listMisNotifications() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    if (isMisForbiddenError(err)) return NextResponse.json({ items: [] }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
