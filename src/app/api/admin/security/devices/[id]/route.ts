import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { setDeviceStatus, removeDevice } from '@/server/access/admin';

function statusFor(msg: string): number {
  return msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : msg.includes('not found') ? 404 : 400;
}

/** Approve or revoke a device. Body: { status: 'approved' | 'revoked' }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
    if (body?.status !== 'approved' && body?.status !== 'revoked') {
      return NextResponse.json({ error: 'status must be "approved" or "revoked"' }, { status: 400 });
    }
    await setDeviceStatus(id, body.status);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: statusFor(msg) });
  }
}

/** Permanently remove a device record. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await removeDevice(id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: statusFor(msg) });
  }
}
