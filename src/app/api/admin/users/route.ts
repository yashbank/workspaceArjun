import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listUsersWithSeats, inviteUser } from '@/server/admin';
import { isInvitableRole } from '@/server/users';
import type { UserRole } from '@/generated/prisma/client';

export async function GET() {
  try {
    const data = await listUsersWithSeats();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, role } = (await request.json()) as { email: string; role: string };
    if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

    const safeRole: UserRole = isInvitableRole(role) ? role : 'member';
    await inviteUser(email.trim().toLowerCase(), safeRole);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : msg.includes('limit') ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
