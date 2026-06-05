import { describe, it, expect } from 'vitest';
import { getSyncFileHealth, isListableFile, VISIBLE_FILE_WHERE } from './file-health';

describe('getSyncFileHealth', () => {
  const base = {
    id: '1',
    name: 'test.pdf',
    deletedAt: null,
    currentVersionId: 'v1',
  };

  it('flags missing version', () => {
    expect(
      getSyncFileHealth({
        ...base,
        currentVersionId: null,
        currentVersion: null,
      }),
    ).toBe('no_version');
  });

  it('flags zero size', () => {
    expect(
      getSyncFileHealth({
        ...base,
        currentVersion: { id: 'v1', sizeBytes: BigInt(0), storageKey: 'k' },
      }),
    ).toBe('zero_size');
  });

  it('ok for valid row', () => {
    expect(
      isListableFile({
        ...base,
        currentVersion: { id: 'v1', sizeBytes: BigInt(1024), storageKey: 'files/x' },
      }),
    ).toBe(true);
  });
});

describe('VISIBLE_FILE_WHERE', () => {
  it('requires the file itself to be active (not trashed)', () => {
    expect(VISIBLE_FILE_WHERE.deletedAt).toBeNull();
  });

  it('requires a current version with size greater than zero', () => {
    expect(VISIBLE_FILE_WHERE.currentVersionId).toEqual({ not: null });
    expect(VISIBLE_FILE_WHERE.currentVersion).toEqual({ is: { sizeBytes: { gt: 0 } } });
  });

  it('counts root files but excludes files inside a trashed folder', () => {
    // Root files (folderId null) OR files whose parent folder is not deleted.
    expect(VISIBLE_FILE_WHERE.OR).toEqual([
      { folderId: null },
      { folder: { is: { deletedAt: null } } },
    ]);
  });
});
