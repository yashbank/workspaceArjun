import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFolderFindFirst = vi.fn();
const mockFolderFindMany = vi.fn();
const mockFolderUpdateMany = vi.fn();
const mockFolderDeleteMany = vi.fn();
const mockFileUpdateMany = vi.fn();
const mockFileFindMany = vi.fn();
const mockFileDeleteMany = vi.fn();
const mockStorageUsageUpdateMany = vi.fn();
const mockDeleteObjects = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    folder: {
      findFirst: (...a: unknown[]) => mockFolderFindFirst(...a),
      findMany: (...a: unknown[]) => mockFolderFindMany(...a),
      updateMany: (...a: unknown[]) => mockFolderUpdateMany(...a),
      deleteMany: (...a: unknown[]) => mockFolderDeleteMany(...a),
    },
    file: {
      updateMany: (...a: unknown[]) => mockFileUpdateMany(...a),
      findMany: (...a: unknown[]) => mockFileFindMany(...a),
      deleteMany: (...a: unknown[]) => mockFileDeleteMany(...a),
    },
    storageUsage: { updateMany: (...a: unknown[]) => mockStorageUsageUpdateMany(...a) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

vi.mock('@/server/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 'owner-1', role: 'owner', email: 'o@e.com' }),
}));
vi.mock('@/server/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/storage', () => ({
  deleteObjects: (...a: unknown[]) => mockDeleteObjects(...a),
  isStorageConfigured: () => true,
}));

import { softDeleteFolder } from '@/server/folders';
import { restoreFolder, permanentDeleteFolder } from '@/server/trash';
import { collectSubtreeFolderIds } from '@/server/folders/tree';

// Tree: F1 → F2 → F3 (F1 is the root being acted on).
function wireTree() {
  mockFolderFindMany.mockImplementation((args: { where: { parentId: { in: string[] } } }) => {
    const parents = args.where.parentId.in;
    if (parents.includes('F1')) return Promise.resolve([{ id: 'F2' }]);
    if (parents.includes('F2')) return Promise.resolve([{ id: 'F3' }]);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  wireTree();
  mockFileUpdateMany.mockResolvedValue({ count: 5 });
  mockFolderUpdateMany.mockResolvedValue({ count: 3 });
  mockFileDeleteMany.mockResolvedValue({ count: 5 });
  mockFolderDeleteMany.mockResolvedValue({ count: 3 });
  mockStorageUsageUpdateMany.mockResolvedValue({ count: 1 });
});

describe('collectSubtreeFolderIds', () => {
  it('collects the root plus every nested descendant folder', async () => {
    const ids = await collectSubtreeFolderIds('F1', 'active');
    expect(ids).toEqual(['F1', 'F2', 'F3']);
  });
});

describe('softDeleteFolder (cascade to trash)', () => {
  it('soft-deletes the folder, nested folders, and all nested files together', async () => {
    mockFolderFindFirst.mockResolvedValue({ id: 'F1', name: 'Root' });

    await softDeleteFolder('F1');

    // Files in the whole subtree get stamped (no file left active → no orphans).
    expect(mockFileUpdateMany).toHaveBeenCalledTimes(1);
    const fileArgs = mockFileUpdateMany.mock.calls[0][0];
    expect(fileArgs.where.folderId.in).toEqual(['F1', 'F2', 'F3']);
    expect(fileArgs.where.deletedAt).toBeNull();
    expect(fileArgs.data.deletedAt).toBeInstanceOf(Date);

    // Folders in the subtree get the same timestamp.
    const folderArgs = mockFolderUpdateMany.mock.calls[0][0];
    expect(folderArgs.where.id.in).toEqual(['F1', 'F2', 'F3']);
    expect(folderArgs.data.deletedAt).toBeInstanceOf(Date);
    expect(folderArgs.data.deletedAt).toEqual(fileArgs.data.deletedAt);
  });
});

describe('restoreFolder (cascade restore)', () => {
  it('restores only the subtree trashed in the same group (matched by timestamp)', async () => {
    const groupTs = new Date('2026-05-01T10:00:00.000Z');
    mockFolderFindFirst.mockResolvedValue({ id: 'F1', name: 'Root', deletedAt: groupTs });

    await restoreFolder('F1');

    const folderArgs = mockFolderUpdateMany.mock.calls[0][0];
    expect(folderArgs.where.id.in).toEqual(['F1', 'F2', 'F3']);
    expect(folderArgs.where.deletedAt).toEqual(groupTs);
    expect(folderArgs.data.deletedAt).toBeNull();

    const fileArgs = mockFileUpdateMany.mock.calls[0][0];
    expect(fileArgs.where.folderId.in).toEqual(['F1', 'F2', 'F3']);
    expect(fileArgs.where.deletedAt).toEqual(groupTs);
    expect(fileArgs.data.deletedAt).toBeNull();
  });
});

describe('permanentDeleteFolder (cascade purge)', () => {
  it('deletes nested files explicitly (no SetNull orphan), folders, storage, and usage', async () => {
    mockFolderFindFirst.mockResolvedValue({ id: 'F1', name: 'Root', deletedAt: new Date() });
    mockFileFindMany.mockResolvedValue([
      { id: 'fileA', versions: [{ storageKey: 'k1', sizeBytes: BigInt(100) }] },
      { id: 'fileB', versions: [{ storageKey: 'k2', sizeBytes: BigInt(50) }] },
    ]);

    await permanentDeleteFolder('F1');

    // Storage blobs removed best-effort, in ONE batched call.
    expect(mockDeleteObjects).toHaveBeenCalledTimes(1);
    expect(mockDeleteObjects).toHaveBeenCalledWith(['k1', 'k2']);

    // Files deleted explicitly so none get SetNull-orphaned to the root.
    const fileDelArgs = mockFileDeleteMany.mock.calls[0][0];
    expect(fileDelArgs.where.folderId.in).toEqual(['F1', 'F2', 'F3']);

    // Folders deleted.
    const folderDelArgs = mockFolderDeleteMany.mock.calls[0][0];
    expect(folderDelArgs.where.id.in).toEqual(['F1', 'F2', 'F3']);

    // Usage decremented by total bytes (150) and file count (2).
    const usageArgs = mockStorageUsageUpdateMany.mock.calls[0][0];
    expect(usageArgs.data.totalBytes.decrement).toEqual(BigInt(150));
    expect(usageArgs.data.fileCount.decrement).toEqual(2);
  });

  it('skips usage update and storage when the folder has no files', async () => {
    mockFolderFindFirst.mockResolvedValue({ id: 'F1', name: 'Empty', deletedAt: new Date() });
    mockFileFindMany.mockResolvedValue([]);

    await permanentDeleteFolder('F1');

    expect(mockDeleteObjects).not.toHaveBeenCalled();
    expect(mockStorageUsageUpdateMany).not.toHaveBeenCalled();
    // Folders are still purged.
    expect(mockFolderDeleteMany).toHaveBeenCalled();
  });
});
