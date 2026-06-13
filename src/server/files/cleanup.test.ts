import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockFileDelete = vi.fn();
const mockFavDeleteMany = vi.fn();
const mockHeadObject = vi.fn();
const mockDeleteObject = vi.fn();
const mockIsStorageConfigured = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    file: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      delete: (...a: unknown[]) => mockFileDelete(...a),
    },
    favorite: { deleteMany: (...a: unknown[]) => mockFavDeleteMany(...a) },
  },
}));
vi.mock('@/server/storage', () => ({
  isStorageConfigured: (...a: unknown[]) => mockIsStorageConfigured(...a),
  deleteObject: (...a: unknown[]) => mockDeleteObject(...a),
  headObject: (...a: unknown[]) => mockHeadObject(...a),
}));

import { scanInvalidFiles, cleanupInvalidFiles } from './cleanup';

const HOUR_MS = 60 * 60 * 1000;

type Row = {
  id: string;
  name: string;
  deletedAt: Date | null;
  createdAt: Date;
  currentVersionId: string | null;
  currentVersion: { id: string; sizeBytes: bigint; storageKey: string; createdAt: Date } | null;
  versions: { id: string; sizeBytes: bigint; storageKey: string }[];
};

/** A healthy, listable file (overridable). */
function row(overrides: Partial<Row> = {}): Row {
  const now = new Date();
  return {
    id: 'f1',
    name: 'file.txt',
    deletedAt: null,
    createdAt: now,
    currentVersionId: 'v1',
    currentVersion: { id: 'v1', sizeBytes: BigInt(10), storageKey: 'k1', createdAt: now },
    versions: [{ id: 'v1', sizeBytes: BigInt(10), storageKey: 'k1' }],
    ...overrides,
  };
}

/** A version-less (in-flight / orphaned) row with the given age. */
function noVersionRow(ageMs: number, id = 'f1'): Row {
  return row({
    id,
    createdAt: new Date(Date.now() - ageMs),
    currentVersionId: null,
    currentVersion: null,
    versions: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsStorageConfigured.mockReturnValue(false);
  mockFavDeleteMany.mockResolvedValue({ count: 0 });
  mockFileDelete.mockResolvedValue({});
});

describe('scanInvalidFiles — no_version age guard', () => {
  it('skips a fresh version-less row (upload likely in progress)', async () => {
    mockFindMany.mockResolvedValue([noVersionRow(0)]);
    const { invalid, scanned } = await scanInvalidFiles({ checkStorage: false });
    expect(scanned).toBe(1);
    expect(invalid).toHaveLength(0);
  });

  it('flags a version-less row older than the grace window', async () => {
    mockFindMany.mockResolvedValue([noVersionRow(2 * HOUR_MS)]);
    const { invalid } = await scanInvalidFiles({ checkStorage: false });
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('no_version');
  });

  it('boundary: just under 1h is skipped, just over 1h is flagged', async () => {
    mockFindMany.mockResolvedValue([
      noVersionRow(HOUR_MS - 60 * 1000, 'under'),
      noVersionRow(HOUR_MS + 60 * 1000, 'over'),
    ]);
    const { invalid } = await scanInvalidFiles({ checkStorage: false });
    expect(invalid.map((i) => i.fileId)).toEqual(['over']);
  });
});

describe('scanInvalidFiles — other reasons unaffected by age', () => {
  it('flags a fresh zero_size row', async () => {
    mockFindMany.mockResolvedValue([
      row({ currentVersion: { id: 'v1', sizeBytes: BigInt(0), storageKey: 'k1', createdAt: new Date() } }),
    ]);
    const { invalid } = await scanInvalidFiles({ checkStorage: false });
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('zero_size');
  });

  it('flags a fresh no_storage_key row', async () => {
    mockFindMany.mockResolvedValue([
      row({ currentVersion: { id: 'v1', sizeBytes: BigInt(10), storageKey: '   ', createdAt: new Date() } }),
    ]);
    const { invalid } = await scanInvalidFiles({ checkStorage: false });
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('no_storage_key');
  });

  it('flags a fresh missing_storage row when storage is checked', async () => {
    mockFindMany.mockResolvedValue([row()]);
    mockIsStorageConfigured.mockReturnValue(true);
    mockHeadObject.mockResolvedValue({ exists: false, contentLength: 0 });
    const { invalid } = await scanInvalidFiles({ checkStorage: true });
    expect(invalid).toHaveLength(1);
    expect(invalid[0].reason).toBe('missing_storage');
  });

  it('does not flag a healthy file', async () => {
    mockFindMany.mockResolvedValue([row()]);
    mockIsStorageConfigured.mockReturnValue(true);
    mockHeadObject.mockResolvedValue({ exists: true, contentLength: 10 });
    const { invalid } = await scanInvalidFiles({ checkStorage: true });
    expect(invalid).toHaveLength(0);
  });
});

describe('cleanupInvalidFiles — respects the age guard', () => {
  it('does not delete a fresh version-less row (active upload protected)', async () => {
    mockFindMany.mockResolvedValue([noVersionRow(0)]);
    const result = await cleanupInvalidFiles(false);
    expect(result.deletedFiles).toBe(0);
    expect(mockFileDelete).not.toHaveBeenCalled();
  });

  it('deletes an old version-less row', async () => {
    const old = noVersionRow(2 * HOUR_MS);
    mockFindMany.mockResolvedValue([old]);
    mockFindUnique.mockResolvedValue({ ...old, versions: [] });
    const result = await cleanupInvalidFiles(false);
    expect(result.deletedFiles).toBe(1);
    expect(mockFileDelete).toHaveBeenCalledWith({ where: { id: 'f1' } });
  });
});
