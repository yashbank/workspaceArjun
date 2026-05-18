import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';

export type SearchResult = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string | null;
  folderId?: string | null;
  createdAt: Date;
};

export async function searchFiles(query: string): Promise<SearchResult[]> {
  await requirePermission('files:read');

  if (!query.trim()) return [];

  const [files, folders] = await Promise.all([
    db.file.findMany({
      where: { name: { contains: query.trim(), mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, mimeType: true, folderId: true, createdAt: true },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    }),
    db.folder.findMany({
      where: { name: { contains: query.trim(), mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, parentId: true, createdAt: true },
      take: 10,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const results: SearchResult[] = [
    ...folders.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'folder' as const,
      folderId: f.parentId,
      createdAt: f.createdAt,
    })),
    ...files.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'file' as const,
      mimeType: f.mimeType,
      folderId: f.folderId,
      createdAt: f.createdAt,
    })),
  ];

  return results;
}

export async function checkDuplicateFileName(
  name: string,
  folderId: string | null,
): Promise<{ exists: boolean; existingFileId?: string }> {
  const existing = await db.file.findFirst({
    where: { name: name.trim(), folderId, deletedAt: null },
    select: { id: true },
  });
  return existing ? { exists: true, existingFileId: existing.id } : { exists: false };
}
