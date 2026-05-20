import { describe, it, expect } from 'vitest';
import { getSyncFileHealth, isListableFile } from './file-health';

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
