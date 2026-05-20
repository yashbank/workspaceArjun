import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { clearAllActivityHistory } from '@/server/activity';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await clearAllActivityHistory(user);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
