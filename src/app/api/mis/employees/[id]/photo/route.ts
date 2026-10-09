import { NextResponse } from 'next/server';

import { isUuid } from '@/lib/mis/ids';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getEmployeePhoto, getEmployeePhotoForDevice } from '@/server/mis/employee-photo';

/**
 * V2 Epic 7 — the employee photo. A gate tablet sends its device bearer token; a signed-in
 * portal user sends their session. Both get the same 256×256 WebP, or a 404 when there is none.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const auth = request.headers.get('authorization');
    const bytes = auth?.startsWith('Bearer ') ? await getEmployeePhotoForDevice(auth, id) : await getEmployeePhoto(id);
    if (!bytes) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' },
    });
  } catch (err: unknown) {
    if (isMisForbiddenError(err)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const status = (err as { status?: number })?.status;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Server error' }, { status: status === 401 ? 401 : 500 });
  }
}
