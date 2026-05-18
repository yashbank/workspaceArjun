import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { listFiles, createFileWithContent } from '@/server/files';

export async function GET(request: NextRequest) {
  try {
    const folderId = request.nextUrl.searchParams.get('folderId') || null;
    const sortBy = request.nextUrl.searchParams.get('sortBy') || 'name';
    const sortDir = request.nextUrl.searchParams.get('sortDir') || 'asc';

    const files = await listFiles(folderId);

    if (sortBy === 'size') {
      files.sort((a, b) => {
        const sa = a.currentVersion ? Number(a.currentVersion.sizeBytes) : 0;
        const sb = b.currentVersion ? Number(b.currentVersion.sizeBytes) : 0;
        return sortDir === 'asc' ? sa - sb : sb - sa;
      });
    } else if (sortBy === 'date') {
      files.sort((a, b) => {
        const da = new Date(a.currentVersion?.createdAt ?? a.createdAt).getTime();
        const db2 = new Date(b.currentVersion?.createdAt ?? b.createdAt).getTime();
        return sortDir === 'asc' ? da - db2 : db2 - da;
      });
    } else if (sortBy === 'type') {
      files.sort((a, b) => {
        const ea = a.name.split('.').pop()?.toLowerCase() ?? '';
        const eb = b.name.split('.').pop()?.toLowerCase() ?? '';
        return sortDir === 'asc' ? ea.localeCompare(eb) : eb.localeCompare(ea);
      });
    } else {
      files.sort((a, b) =>
        sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
      );
    }

    const serialized = files.map((f) => ({
      ...f,
      currentVersionId: f.currentVersionId,
      currentVersion: f.currentVersion
        ? { ...f.currentVersion, sizeBytes: f.currentVersion.sizeBytes.toString() }
        : null,
    }));

    return NextResponse.json(serialized);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folderId = (formData.get('folderId') as string) || null;

    if (!file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'application/octet-stream';

    const result = await createFileWithContent({
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      folderId: folderId === 'null' ? null : folderId,
      fileBuffer: buffer,
    });

    return NextResponse.json({ file: result.file, storageKey: result.storageKey }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg.includes('Object storage is not configured')) {
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (msg.includes('Storage upload failed') || msg.includes('Storage verification failed')) {
      return NextResponse.json({ error: msg }, { status: 502 });
    }
    const status = msg === 'Unauthorized' ? 401 : msg === 'Forbidden' ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
