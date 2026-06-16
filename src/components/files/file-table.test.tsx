import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FileTable, type FileItem } from './file-table';

// Render-counter: each row renders <FileMediaThumbnail fileId=...> for a .png
// file. Mocking it to count by fileId means "leaf invoked" == "row re-rendered"
// (a memoized row that skips never re-invokes its children).
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

// Stable handler identities (module scope) — models a post-3A FileBrowser that
// passes the same callback references on every render.
const cb = {
  onRename: () => {},
  onDelete: () => {},
  onDownload: () => {},
  onNewVersion: () => {},
  onPreview: () => {},
  onMove: () => {},
  onFavorite: () => {},
  onPermanentDelete: () => {},
  onVersionRestored: () => {},
};

describe('FileTable memoization (Wave 3B)', () => {
  it('does not re-render any row when the parent re-renders with identical props', () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const favorites = new Set<string>();
    const props = { files, favorites, canMove: true, canPermanentDelete: false, ...cb };

    const { rerender } = render(<FileTable {...props} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    // Same prop values (same refs) — models an unrelated parent re-render such as
    // an upload-progress tick. FileTable's memo should short-circuit entirely.
    rerender(<FileTable {...props} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);
  });

  it('re-renders only the affected row when one favorite changes', () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const props = { files, canMove: true, canPermanentDelete: false, ...cb };

    const { rerender } = render(<FileTable {...props} favorites={new Set<string>()} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    rerender(<FileTable {...props} favorites={new Set<string>(['b'])} />);
    expect(thumbRenders.get('a')).toBe(1); // unchanged
    expect(thumbRenders.get('b')).toBe(2); // only this row re-rendered
    expect(thumbRenders.get('c')).toBe(1); // unchanged
  });

  it('does not re-render rows whose file identity is preserved when the array is replaced', () => {
    const a = makeFile('a');
    const b = makeFile('b');
    const c = makeFile('c');
    const props = { canMove: true, canPermanentDelete: false, favorites: new Set<string>(), ...cb };

    const { rerender } = render(<FileTable {...props} files={[a, b, c]} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    // New array + new order but identical element references (mirrors sortFiles'
    // [...files].sort(), which preserves element identity). Rows must not repaint.
    rerender(<FileTable {...props} files={[c, b, a]} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);
  });
});
