import { NextResponse } from 'next/server';
import { listTrashedFolders, listTrashedFiles } from '@/server/trash';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  try {
    const [folders, files] = await Promise.all([listTrashedFolders(), listTrashedFiles()]);

    const serializedFiles = files.map((f) => ({
      ...f,
      currentVersion: f.currentVersion
        ? { ...f.currentVersion, sizeBytes: f.currentVersion.sizeBytes.toString() }
        : null,
    }));

    return NextResponse.json({ folders, files: serializedFiles }, { headers: NO_STORE });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status, headers: NO_STORE });
  }
}
