import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { inviteAgainForEmail } from '@/server/admin';
import type { UserRole } from '@/generated/prisma/client';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; role?: string };
    const email = body.email?.trim();
    const role = body.role as UserRole | undefined;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const validRoles: UserRole[] = ['admin', 'member', 'viewer'];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await inviteAgainForEmail(email, role);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg.includes('limit')
            ? 409
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
