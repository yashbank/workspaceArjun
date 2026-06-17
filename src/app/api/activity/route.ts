import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAccessBlockedError, accessBlockedResponse } from '@/lib/api-error';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac/permissions';
import { listActivity } from '@/server/activity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !hasPermission(user.role, 'audit:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE });
    }

    const sp = request.nextUrl.searchParams;
    const tzRaw = sp.get('tzOffset');
    const tzOffset = tzRaw != null && tzRaw !== '' ? Number(tzRaw) : undefined;
    const pageRaw = sp.get('page');
    const page = pageRaw ? Number(pageRaw) : undefined;

    const data = await listActivity(user, {
      actorId: sp.get('actorId') ?? undefined,
      action: sp.get('action') ?? undefined,
      targetType: sp.get('targetType') ?? undefined,
      from: sp.get('from') ?? undefined,
      to: sp.get('to') ?? undefined,
      tzOffset: Number.isFinite(tzOffset) ? tzOffset : undefined,
      q: sp.get('q') ?? undefined,
      starredOnly: sp.get('starredOnly') === 'true',
      page: page && Number.isFinite(page) ? page : undefined,
    });

    return NextResponse.json(
      {
        events: data.events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        actors: data.actors,
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
      },
      { headers: NO_STORE },
    );
  } catch (e: unknown) {
    if (isAccessBlockedError(e)) return accessBlockedResponse();
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status, headers: NO_STORE });
  }
}
