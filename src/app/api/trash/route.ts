import { NextResponse } from 'next/server';
import { listTrashedFolders, listTrashedFiles } from '@/server/trash';

export async function GET() {
  try {
    const [folders, files] = await Promise.all([listTrashedFolders(), listTrashedFiles()]);

    const serializedFiles = files.map((f) => ({
      ...f,
      currentVersion: f.currentVersion
        ? { ...f.currentVersion, sizeBytes: f.currentVersion.sizeBytes.toString() }
        : null,
    }));

    return NextResponse.json({ folders, files: serializedFiles });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
