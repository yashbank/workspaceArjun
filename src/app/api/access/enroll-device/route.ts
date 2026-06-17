import { NextResponse } from 'next/server';
import { enrollDeviceWithCode } from '@/server/access/enroll';

/** Self-service: the signed-in user registers this device with their access code. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code : '';
    const { browser } = await enrollDeviceWithCode(code);
    return NextResponse.json({ ok: true, browser });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
