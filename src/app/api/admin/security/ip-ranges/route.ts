import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { addAllowedIpRange } from '@/server/access/admin';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      value?: string;
      label?: string;
      userId?: string | null;
    };
    if (!body.value?.trim()) {
      return NextResponse.json({ error: 'IP address or CIDR is required' }, { status: 400 });
    }
    const range = await addAllowedIpRange({
      value: body.value,
      label: body.label,
      userId: body.userId ?? null,
    });
    return NextResponse.json(range, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status =
      msg === 'Unauthorized'
        ? 401
        : msg === 'Forbidden'
          ? 403
          : msg === 'User not found'
            ? 404
            : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
