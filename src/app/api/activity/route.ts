import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac/permissions';
import { listActivity } from '@/server/activity';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.role, 'audit:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const data = await listActivity(user, {
      actorId: sp.get('actorId') ?? undefined,
      action: sp.get('action') ?? undefined,
      targetType: sp.get('targetType') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      q: sp.get('q') ?? undefined,
      starredOnly: sp.get('starredOnly') === 'true',
    });

    return NextResponse.json({
      events: data.events.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      actors: data.actors,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
