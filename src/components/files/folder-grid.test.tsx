import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { FolderGrid } from './folder-grid';

// FolderCard renders exactly one <FixedMenu> and exposes no per-folder id to any
// mockable child, so we count total FixedMenu renders and assert on the delta:
// one card re-rendering bumps the total by exactly one.
const { menuRenders } = vi.hoisted(() => ({ menuRenders: { count: 0 } }));

vi.mock('@/components/ui/fixed-menu', () => ({
  FixedMenu: () => {
    menuRenders.count += 1;
    return null;
  },
}));

afterEach(() => {
  cleanup();
  menuRenders.count = 0;
});

function makeFolder(id: string) {
  return { id, name: `F-${id}`, _count: { children: 0, files: 0 } };
}

const cb = {
  onOpen: () => {},
  onRename: () => {},
  onDelete: () => {},
  onMove: () => {},
  onDownload: () => {},
};

describe('FolderGrid / FolderCard memoization (Wave 3B)', () => {
  it('does not re-render any card when folder identities are preserved', () => {
    const a = makeFolder('a');
    const b = makeFolder('b');
    const c = makeFolder('c');

    const { rerender } = render(<FolderGrid folders={[a, b, c]} {...cb} />);
    expect(menuRenders.count).toBe(3); // one per card on mount

    // New array reference (forces FolderGrid itself to re-render) but identical
    // element references + stable callbacks → every FolderCard memo should skip.
    rerender(<FolderGrid folders={[a, b, c]} {...cb} />);
    expect(menuRenders.count).toBe(3); // delta 0
  });

  it('re-renders only the replaced card', () => {
    const a = makeFolder('a');
    const b = makeFolder('b');
    const c = makeFolder('c');

    const { rerender } = render(<FolderGrid folders={[a, b, c]} {...cb} />);
    expect(menuRenders.count).toBe(3);

    // Replace exactly one folder object with a new identity (same id/name).
    const b2 = makeFolder('b');
    rerender(<FolderGrid folders={[a, b2, c]} {...cb} />);
    expect(menuRenders.count).toBe(4); // delta 1 — only that card re-rendered
  });
});
