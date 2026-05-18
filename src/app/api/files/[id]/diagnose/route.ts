import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { headObject, isStorageConfigured, getStorageDriverName } from '@/server/storage';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Dev-only endpoint' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const file = await db.file.findUnique({
      where: { id },
      include: { currentVersion: true, versions: true },
    });

    if (!file) return NextResponse.json({ error: 'File not found in DB' }, { status: 404 });

    const storageKey = file.currentVersion?.storageKey ?? null;
    let storageStatus: { exists: boolean; contentLength?: number } = { exists: false };
    if (storageKey && isStorageConfigured()) {
      storageStatus = await headObject(storageKey);
    }

    return NextResponse.json({
      fileId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      currentVersionId: file.currentVersionId,
      storageKey,
      storageDriver: getStorageDriverName(),
      storageConfigured: isStorageConfigured(),
      objectExists: storageStatus.exists,
      objectSize: storageStatus.contentLength ?? null,
      dbSize: file.currentVersion ? Number(file.currentVersion.sizeBytes) : null,
      versionCount: file.versions.length,
      createdAt: file.createdAt,
      deletedAt: file.deletedAt,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
