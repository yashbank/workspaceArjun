import { NextResponse } from 'next/server';

import { isUuid } from '@/lib/mis/ids';
import { isMisForbiddenError } from '@/server/mis/auth';
import { listDocuments } from '@/server/mis/documents';

export async function GET(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    // A bad id is "not found", not a database error that comes back as a 500 (F-25).
    if (!isUuid(orderId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const docs = await listDocuments(orderId);
    return NextResponse.json(docs);
  } catch (err: unknown) {
    // `requirePermission` throws a MisForbiddenError ("Not permitted: …"); the old check compared the message to
    // 'Forbidden', which never matched, so a refused role got a 500 instead of a 403 (F-25).
    if (isMisForbiddenError(err)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
