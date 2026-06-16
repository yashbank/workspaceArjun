import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FileGrid } from './file-grid';
import type { FileItem } from './file-table';

// Same counter mechanism as file-table.test: each FileCard renders
// <FileMediaThumbnail fileId=...> for a .png file.
const { thumbRenders } = vi.hoisted(() => ({ thumbRenders: new Map<string, number>() }));

vi.mock('./file-media-thumbnail', () => ({
  FileMediaThumbnail: ({ fileId }: { fileId: string }) => {
    thumbRenders.set(fileId, (thumbRenders.get(fileId) ?? 0) + 1);
    return null;
  },
}));
vi.mock('./file-action-menu', () => ({ FileActionMenu: () => null }));
vi.mock('./premium-file-fallback', () => ({ PremiumFileFallback: () => null }));

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

const cb = {
  onPreview: () => {},
  onDownload: () => {},
  onRename: () => {},
  onDelete: () => {},
  onNewVersion: () => {},
  onMove: () => {},
  onFavorite: () => {},
  onToggleSelect: () => {},
  onPermanentDelete: () => {},
};

describe('FileGrid / FileCard memoization (Wave 3B)', () => {
  it('does not re-render any card when the parent re-renders with identical props', () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const props = {
      files,
      favorites: new Set<string>(),
      selectedIds: new Set<string>(),
      canMove: true,
      canPermanentDelete: false,
      ...cb,
    };

    const { rerender } = render(<FileGrid {...props} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    rerender(<FileGrid {...props} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);
  });

  it('re-renders only the selected card when one selection changes', () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const base = {
      files,
      favorites: new Set<string>(),
      canMove: true,
      canPermanentDelete: false,
      ...cb,
    };

    const { rerender } = render(<FileGrid {...base} selectedIds={new Set<string>()} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    rerender(<FileGrid {...base} selectedIds={new Set<string>(['b'])} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(2); // only the toggled card re-rendered
    expect(thumbRenders.get('c')).toBe(1);
  });

  it('re-renders only the affected card when one favorite changes', () => {
    const files = [makeFile('a'), makeFile('b'), makeFile('c')];
    const base = {
      files,
      selectedIds: new Set<string>(),
      canMove: true,
      canPermanentDelete: false,
      ...cb,
    };

    const { rerender } = render(<FileGrid {...base} favorites={new Set<string>()} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(1);

    rerender(<FileGrid {...base} favorites={new Set<string>(['c'])} />);
    expect(thumbRenders.get('a')).toBe(1);
    expect(thumbRenders.get('b')).toBe(1);
    expect(thumbRenders.get('c')).toBe(2); // only the favorited card re-rendered
  });
});
