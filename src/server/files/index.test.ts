import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFileFindFirst = vi.fn();
const mockFileUpdate = vi.fn();
const mockFolderFindFirst = vi.fn();
const mockLog = vi.fn();
const mockRequirePermission = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    file: {
      findFirst: (...a: unknown[]) => mockFileFindFirst(...a),
      update: (...a: unknown[]) => mockFileUpdate(...a),
    },
    folder: {
      findFirst: (...a: unknown[]) => mockFolderFindFirst(...a),
    },
  },
}));
vi.mock('@/server/rbac', () => ({ requirePermission: (...a: unknown[]) => mockRequirePermission(...a) }));
vi.mock('@/server/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockLog(...a) }));
vi.mock('@/server/storage', () => ({
  buildStorageKey: vi.fn(),
  putObject: vi.fn(),
  getObject: vi.fn(),
  headObject: vi.fn(),
  deleteObject: vi.fn(),
  isStorageConfigured: vi.fn(() => false),
}));
vi.mock('@/server/folders', () => ({ folderNameOrRoot: vi.fn(async () => 'Root') }));

import { bulkSoftDeleteFiles, bulkMoveFiles } from './index';

/** db.file.findFirst stub: every id resolves to a live file. */
function liveFiles() {
  mockFileFindFirst.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve({ id: args.where.id, name: `file-${args.where.id}`, folderId: 'src' }),
  );
}

/** db.file.findFirst stub: `missingId` resolves to null (not found / trashed). */
function liveFilesExcept(missingId: string) {
  mockFileFindFirst.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(
      args.where.id === missingId
        ? null
        : { id: args.where.id, name: `file-${args.where.id}`, folderId: 'src' },
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue({ id: 'actor-1', role: 'member', email: 'm@e.com' });
  mockFileUpdate.mockResolvedValue({});
});

describe('bulkSoftDeleteFiles', () => {
  it('soft-deletes every file and audits each one', async () => {
    liveFiles();

    const result = await bulkSoftDeleteFiles(['a', 'b', 'c']);

    expect(result).toEqual({ succeeded: 3, failed: 0 });
    expect(mockFileUpdate).toHaveBeenCalledTimes(3);
    const updatedIds = mockFileUpdate.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toEqual(['a', 'b', 'c']);
    expect(mockFileUpdate.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    expect(mockLog).toHaveBeenCalledTimes(3);
    expect(mockLog.mock.calls.every((c) => c[0].action === 'file.delete')).toBe(true);
  });

  it('counts a missing file as failed without aborting the rest', async () => {
    liveFilesExcept('b');

    const result = await bulkSoftDeleteFiles(['a', 'b', 'c']);

    expect(result).toEqual({ succeeded: 2, failed: 1 });
    expect(mockFileUpdate).toHaveBeenCalledTimes(2);
    const updatedIds = mockFileUpdate.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toEqual(['a', 'c']);
  });

  it('propagates Forbidden from the permission gate instead of a silent zero-count', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'));

    await expect(bulkSoftDeleteFiles(['a'])).rejects.toThrow('Forbidden');
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockFileUpdate).not.toHaveBeenCalled();
  });

  it('rejects requests above the bulk cap before touching any file', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);

    await expect(bulkSoftDeleteFiles(ids)).rejects.toThrow(/max 500/i);
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockFileUpdate).not.toHaveBeenCalled();
  });
});

describe('bulkMoveFiles', () => {
  it('moves every selected file to the target, not just the first (regression)', async () => {
    mockFolderFindFirst.mockResolvedValue({ id: 'dest' });
    liveFiles();

    const result = await bulkMoveFiles(['a', 'b', 'c'], 'dest');

    expect(result).toEqual({ succeeded: 3, failed: 0 });
    expect(mockFileUpdate).toHaveBeenCalledTimes(3);
    const movedIds = mockFileUpdate.mock.calls.map((c) => c[0].where.id);
    expect(movedIds).toEqual(['a', 'b', 'c']);
    expect(mockFileUpdate.mock.calls.every((c) => c[0].data.folderId === 'dest')).toBe(true);
    expect(mockLog).toHaveBeenCalledTimes(3);
    expect(mockLog.mock.calls.every((c) => c[0].action === 'file.move')).toBe(true);
  });

  it('moves to Root (null target) without a target lookup', async () => {
    liveFiles();

    const result = await bulkMoveFiles(['a', 'b'], null);

    expect(result).toEqual({ succeeded: 2, failed: 0 });
    expect(mockFolderFindFirst).not.toHaveBeenCalled();
    expect(mockFileUpdate.mock.calls.every((c) => c[0].data.folderId === null)).toBe(true);
  });

  it('fails fast when the target folder does not exist', async () => {
    mockFolderFindFirst.mockResolvedValue(null);

    await expect(bulkMoveFiles(['a', 'b'], 'ghost')).rejects.toThrow('Target folder not found');
    expect(mockFileFindFirst).not.toHaveBeenCalled();
    expect(mockFileUpdate).not.toHaveBeenCalled();
  });

  it('counts a missing file as failed without aborting the rest', async () => {
    mockFolderFindFirst.mockResolvedValue({ id: 'dest' });
    liveFilesExcept('b');

    const result = await bulkMoveFiles(['a', 'b', 'c'], 'dest');

    expect(result).toEqual({ succeeded: 2, failed: 1 });
    expect(mockFileUpdate).toHaveBeenCalledTimes(2);
  });

  it('propagates Forbidden from the permission gate', async () => {
    mockRequirePermission.mockRejectedValue(new Error('Forbidden'));

    await expect(bulkMoveFiles(['a'], 'dest')).rejects.toThrow('Forbidden');
    expect(mockFolderFindFirst).not.toHaveBeenCalled();
    expect(mockFileUpdate).not.toHaveBeenCalled();
  });
});
