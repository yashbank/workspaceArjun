import { NextResponse } from 'next/server';

import { listAttendanceLive } from '@/server/mis/attendance';

/**
 * Polled by the kiosk screen every ~1.5s so in/out counts and status update live,
 * without a page refresh, whichever device recorded the punch (this screen or an
 * Android kiosk tablet). Thin: parse, call the server function, map its refusal.
 */
export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get('date') ?? undefined;
    const rows = await listAttendanceLive(date);
    return NextResponse.json(
      { attendance: rows },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const name = (err as Error)?.name;
    const message = (err as Error)?.message;
    if (name === 'MisForbiddenError' || message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Could not load attendance' }, { status: 500 });
  }
}
