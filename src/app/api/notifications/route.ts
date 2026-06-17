import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { listSecurityNotifications } from '@/server/notifications';

/** The current user's recent security notifications (only Owners receive these). */
export async function GET() {
  try {
    const user = await requireUser();
    const items = await listSecurityNotifications(user.id);
    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
