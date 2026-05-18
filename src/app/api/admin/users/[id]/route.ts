import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { changeUserRole, setUserStatus } from '@/server/admin';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { role?: string; status?: string };

    if (body.role) {
      const validRoles = ['owner', 'admin', 'member', 'viewer'];
      if (!validRoles.includes(body.role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      const user = await changeUserRole(id, body.role as 'owner' | 'admin' | 'member' | 'viewer');
      return NextResponse.json(user);
    }

    if (body.status) {
      if (!['active', 'deactivated'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const user = await setUserStatus(id, body.status as 'active' | 'deactivated');
      return NextResponse.json(user);
    }

    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
