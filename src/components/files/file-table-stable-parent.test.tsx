import { describe, it, expect, vi, afterEach } from 'vitest';
import { useCallback, useMemo, useState } from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { FileTable, type FileItem } from './file-table';

// Always-green guard for the 3A *pattern*: a parent that passes stable handler
// identities (useCallback) must not re-render the real FileTable's rows when an
// unrelated piece of its own state changes (e.g. an upload-queue tick).
const { thumbRenders } = vi.hoisted(() => ({ thumbRenders: new Map<string, number>() }));

vi.mock('./file-media-thumbnail', () => ({
  FileMediaThumbnail: ({ fileId }: { fileId: string }) => {
    thumbRenders.set(fileId, (thumbRenders.get(fileId) ?? 0) + 1);
    return null;
  },
}));
vi.mock('./file-action-menu', () => ({ FileActionMenu: () => null }));
vi.mock('./premium-file-fallback', () => ({ PremiumFileFallback: () => null }));
vi.mock('./version-panel', () => ({ VersionPanel: () => null }));

afterEach(() => {
  cleanup();
  thumbRenders.clear();
});

function makeFile(id: string): FileItem {
  return {
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentVersionId: `${id}-v1`,
    _count: { versions: 1 },
    currentVersion: { sizeBytes: '1024', createdAt: '2026-01-01T00:00:00.000Z' },
  };
}

function StableParent({ files }: { files: FileItem[] }) {
  // Unrelated state, like FileBrowser's upload `queue`.
  const [tick, setTick] = useState(0);

  const onRename = useCallback(() => {}, []);
  const onDelete = useCallback(() => {}, []);
  const onDownload = useCallback(() => {}, []);
  const onNewVersion = useCallback(() => {}, []);
  const onPreview = useCallback(() => {}, []);
  const onMove = useCallback(() => {}, []);
  const onFavorite = useCallback(() => {}, []);
  const onPermanentDelete = useCallback(() => {}, []);
  const onVersionRestored = useCallback(() => {}, []);
  const favorites = useMemo(() => new Set<string>(), []);

  return (
    <>
      <button data-testid="tick" onClick={() => setTick((n) => n + 1)}>
        tick {tick}
      </button>
      <FileTable
        files={files}
        favorites={favorites}
        canMove
        canPermanentDelete={false}
        onRename={onRename}
        onDelete={onDelete}
        onDownload={onDownload}
        onNewVersion={onNewVersion}
        onPreview={onPreview}
        onMove={onMove}
        onFavorite={onFavorite}
        onPermanentDelete={onPermanentDelete}
        onVersionRestored={onVersionRestored}
      />
    </>
  );
}

describe('FileTable under a stable-handler parent (Wave 3A pattern)', () => {
  it('does not re-render rows when the parent’s unrelated state changes', () => {
    const files = [makeFile('a'), makeFile('b')];
    const { getByTestId } = render(<StableParent files={files} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);

    fireEvent.click(getByTestId('tick'));
    fireEvent.click(getByTestId('tick'));

    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
  });
});
