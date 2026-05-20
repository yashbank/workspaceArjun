import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';
import { headObject, isStorageConfigured, getStorageDriverName } from '@/server/storage';

/** Owner/admin storage diagnostic for orphan DB records (missing blobs). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const profile = await getCurrentUser();
    if (!profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (profile.role !== 'owner' && profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const file = await db.file.findUnique({
      where: { id },
      include: { currentVersion: true, versions: { orderBy: { versionNo: 'desc' } } },
    });

    if (!file) return NextResponse.json({ error: 'File not found in DB' }, { status: 404 });

    const storageKey = file.currentVersion?.storageKey ?? null;
    let storageStatus: { exists: boolean; contentLength?: number } = { exists: false };
    if (storageKey && isStorageConfigured()) {
      storageStatus = await headObject(storageKey);
    }

    const versionChecks = await Promise.all(
      file.versions.map(async (v) => {
        const head = v.storageKey && isStorageConfigured()
          ? await headObject(v.storageKey)
          : { exists: false };
        return {
          versionId: v.id,
          versionNo: v.versionNo,
          storageKey: v.storageKey,
          objectExists: head.exists,
          objectSize: head.contentLength ?? null,
        };
      }),
    );

    if (storageKey && !storageStatus.exists) {
      console.warn('[storage.diagnose] missing current object', {
        fileId: file.id,
        storageKey,
        actorId: profile.id,
      });
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
      versions: versionChecks,
      createdAt: file.createdAt,
      deletedAt: file.deletedAt,
      orphanRecord: !!storageKey && !storageStatus.exists,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
