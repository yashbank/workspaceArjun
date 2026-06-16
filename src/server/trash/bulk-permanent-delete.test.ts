import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFolderFindMany = vi.fn();
const mockFileFindMany = vi.fn();
const mockFileDeleteMany = vi.fn();
const mockFolderDeleteMany = vi.fn();
const mockStorageUsageUpdateMany = vi.fn();
const mockDeleteObjects = vi.fn();
const mockLogAuditEvent = vi.fn();
const mockLogAuditEvents = vi.fn();
const callOrder: string[] = [];

vi.mock('@/server/db', () => ({
  db: {
    folder: {
      findMany: (...a: unknown[]) => mockFolderFindMany(...a),
      deleteMany: (...a: unknown[]) => {
        callOrder.push('folder.deleteMany');
        return mockFolderDeleteMany(...a);
      },
    },
    file: {
      findMany: (...a: unknown[]) => mockFileFindMany(...a),
      deleteMany: (...a: unknown[]) => {
        callOrder.push('file.deleteMany');
        return mockFileDeleteMany(...a);
      },
    },
    storageUsage: { updateMany: (...a: unknown[]) => mockStorageUsageUpdateMany(...a) },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  },
}));

vi.mock('@/server/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 'owner-1', role: 'owner', email: 'o@e.com' }),
}));
vi.mock('@/server/audit', () => ({
  logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a),
  logAuditEvents: (...a: unknown[]) => mockLogAuditEvents(...a),
}));
vi.mock('@/server/storage', () => ({
  deleteObjects: (...a: unknown[]) => {
    callOrder.push('deleteObjects');
    return mockDeleteObjects(...a);
  },
  isStorageConfigured: () => true,
}));

import { bulkPermanentDeleteTrash } from '@/server/trash';

beforeEach(() => {
  vi.clearAllMocks();
  callOrder.length = 0;
  mockFileDeleteMany.mockResolvedValue({ count: 2 });
  mockFolderDeleteMany.mockResolvedValue({ count: 3 });
  mockStorageUsageUpdateMany.mockResolvedValue({ count: 1 });
  mockDeleteObjects.mockResolvedValue(undefined);

  // Folder F1 → F2 → F3 subtree; one file in F2 plus a directly-selected file.
  mockFolderFindMany.mockImplementation((args: { where: { id?: { in: string[] }; parentId?: { in: string[] } } }) => {
    if (args.where.id) return Promise.resolve([{ id: 'F1', name: 'Root' }]); // roots query
    const parents = args.where.parentId!.in;
    if (parents.includes('F1')) return Promise.resolve([{ id: 'F2' }]);
    if (parents.includes('F2')) return Promise.resolve([{ id: 'F3' }]);
    return Promise.resolve([]);
  });
  mockFileFindMany.mockImplementation((args: { where: { id?: { in: string[] }; folderId?: { in: string[] } } }) => {
    if (args.where.id) {
      return Promise.resolve([
        { id: 'fileX', name: 'x.pdf', folderId: null, versions: [{ storageKey: 'kx', sizeBytes: BigInt(10) }] },
      ]);
    }
    return Promise.resolve([
      { id: 'fileA', name: 'a.pdf', folderId: 'F2', versions: [{ storageKey: 'k1', sizeBytes: BigInt(100) }] },
    ]);
  });
});

describe('bulkPermanentDeleteTrash (set-based)', () => {
  it('purges the union of subtrees + selected files in ONE transaction and ONE storage batch', async () => {
    const result = await bulkPermanentDeleteTrash({ folderIds: ['F1'], fileIds: ['fileX'] });

    // One deleteMany each (set-based), not per-item.
    expect(mockFileDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockFolderDeleteMany).toHaveBeenCalledTimes(1);
    expect(mockFileDeleteMany.mock.calls[0][0].where.id.in).toEqual(['fileA', 'fileX']);
    expect(mockFolderDeleteMany.mock.calls[0][0].where.id.in).toEqual(['F1', 'F2', 'F3']);

    // One batched storage delete with all version keys.
    expect(mockDeleteObjects).toHaveBeenCalledTimes(1);
    expect(mockDeleteObjects).toHaveBeenCalledWith(['k1', 'kx']);

    // One usage decrement summed across the batch (110 bytes, 2 files).
    expect(mockStorageUsageUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockStorageUsageUpdateMany.mock.calls[0][0].data.totalBytes.decrement).toEqual(BigInt(110));
    expect(mockStorageUsageUpdateMany.mock.calls[0][0].data.fileCount.decrement).toEqual(2);

    // Returns the full removed-id sets so the client can drop the exact rows.
    expect(result).toEqual({
      deletedFolders: 1,
      deletedFiles: 1,
      deletedFolderIds: ['F1', 'F2', 'F3'],
      deletedFileIds: ['fileA', 'fileX'],
    });
  });

  it('is DB-first: storage deletion happens AFTER the DB deletes', async () => {
    await bulkPermanentDeleteTrash({ folderIds: ['F1'], fileIds: [] });
    const fileIdx = callOrder.indexOf('file.deleteMany');
    const folderIdx = callOrder.indexOf('folder.deleteMany');
    const storageIdx = callOrder.indexOf('deleteObjects');
    expect(fileIdx).toBeGreaterThanOrEqual(0);
    expect(storageIdx).toBeGreaterThan(fileIdx);
    expect(storageIdx).toBeGreaterThan(folderIdx);
  });

  it('writes one audit event per top-level item in a single batched call', async () => {
    await bulkPermanentDeleteTrash({ folderIds: ['F1'], fileIds: ['fileX'] });

    // ONE batched insert (not N single inserts), and never the single-row path.
    expect(mockLogAuditEvents).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).not.toHaveBeenCalled();

    const entries = mockLogAuditEvents.mock.calls[0][0] as Array<{
      action: string;
      targetId: string;
      meta: Record<string, unknown>;
    }>;
    const actions = entries.map((e) => e.action);
    expect(actions).toContain('folder.permanent_delete');
    expect(actions).toContain('file.permanent_delete');

    // Identical metadata to the previous per-item events is preserved.
    const folderEvent = entries.find((e) => e.action === 'folder.permanent_delete')!;
    expect(folderEvent.meta).toMatchObject({ name: 'Root', folderCount: 3, fileCount: 1 });
    const fileEvent = entries.find((e) => e.action === 'file.permanent_delete')!;
    expect(fileEvent.meta).toMatchObject({ name: 'x.pdf', versionsDeleted: 1 });
  });
});
