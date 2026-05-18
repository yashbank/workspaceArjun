import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listUsers, inviteUser } from '@/server/admin';

export async function GET() {
  try {
    const users = await listUsers();
    return NextResponse.json(users);
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

    const validRoles = ['admin', 'member', 'viewer'];
    const safeRole = validRoles.includes(role) ? role : 'member';

    await inviteUser(email.trim().toLowerCase(), safeRole as 'admin' | 'member' | 'viewer');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
