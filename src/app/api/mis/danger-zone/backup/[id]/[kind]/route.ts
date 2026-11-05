import { NextResponse } from 'next/server';

import { isMisForbiddenError } from '@/server/mis/auth';
import { DataResetError, getBackupDownload } from '@/server/mis/data-reset';

/** Owner-only backup download. Thin: the server function gates, audits and picks a signed link or the bytes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  try {
    const { id, kind } = await params;
    const file = await getBackupDownload({ backupId: id, kind });
    if ('url' in file) return NextResponse.redirect(file.url);
    return new NextResponse(Buffer.from(file.bytes), {
      headers: {
        'Content-Type': file.contentType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (isMisForbiddenError(err) || (err as Error)?.message === 'Forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if ((err as Error)?.message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (err instanceof DataResetError) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: 'Could not download the backup' }, { status: 500 });
  }
}
