import { NextResponse } from 'next/server';
import { listAccessOverview, setAccessEnforcement } from '@/server/access/admin';

export async function GET() {
  try {
    const data = await listAccessOverview();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Toggle workspace access enforcement on/off. Body: { enforcement: boolean }. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { enforcement?: unknown } | null;
    if (typeof body?.enforcement !== 'boolean') {
      return NextResponse.json({ error: 'enforcement (boolean) is required' }, { status: 400 });
    }
    await setAccessEnforcement(body.enforcement);
    return NextResponse.json({ ok: true, enforcement: body.enforcement });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
