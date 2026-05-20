import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { changeUserRole, setUserStatus, removeUser } from '@/server/admin';
import type { UserRole } from '@/generated/prisma/client';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { role?: string; status?: string };

    if (body.role) {
      const validRoles: UserRole[] = ['owner', 'admin', 'member', 'viewer'];
      if (!validRoles.includes(body.role as UserRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      const user = await changeUserRole(id, body.role as UserRole);
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
    const status =
      msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : msg.includes('limit') ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await removeUser(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
