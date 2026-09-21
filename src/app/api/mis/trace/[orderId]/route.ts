import { NextResponse } from 'next/server';

import { isUuid } from '@/lib/mis/ids';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getOrderTrace } from '@/server/mis/traceability';

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    if (!isUuid(orderId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const trace = await getOrderTrace(orderId);
    return NextResponse.json(trace);
  } catch (err: unknown) {
    // A refused role is a 403 — the old check compared the message to 'Forbidden', which a MisForbiddenError never has (F-25).
    if (isMisForbiddenError(err)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
