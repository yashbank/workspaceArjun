import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
import { DropZone, type DropMeta } from './drop-zone';
import { planFolderImport } from '@/lib/folder-import-plan';

vi.mock('@/lib/dnd', () => ({ isInternalDrag: () => false }));

// --- Mock the HTML5 FileSystem entry API the browser hands us on a folder drop ---
function fileEntry(name: string) {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (resolve: (f: File) => void) => resolve(new File(['x'], name, { type: 'text/plain' })),
  };
}
function dirEntry(name: string, children: unknown[]) {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let served = false;
      return {
        // readEntries returns the batch once, then [] to signal completion.
        readEntries(cb: (batch: unknown[]) => void) {
          if (served) return cb([]);
          served = true;
          cb(children);
        },
      };
    },
  };
}

// Exact reported tree, dropped as the folder "A" (with macOS .DS_Store junk).
function treeA() {
  return dirEntry('A', [
    fileEntry('file1'),
    fileEntry('file2'),
    fileEntry('.DS_Store'),
    dirEntry('B', [fileEntry('file3'), fileEntry('file4'), dirEntry('D', [fileEntry('file5')])]),
    dirEntry('C', [fileEntry('file6'), dirEntry('E', [fileEntry('file7')])]),
  ]);
}

function dropTreeAndCapture() {
  let captured: { files: File[]; meta: DropMeta } | null = null;
  const { container } = render(
    <DropZone onFilesDropped={(files, meta) => { captured = { files, meta }; }}>
      <div>zone</div>
    </DropZone>,
  );
  const root = container.firstElementChild as Element;
  const dataTransfer = {
    types: [] as string[],
    items: [{ kind: 'file', webkitGetAsEntry: () => treeA(), getAsFile: () => null }],
    files: [] as File[],
  };
  return { root, dataTransfer, get: () => captured };
}

afterEach(cleanup);

const rel = (f: File) => (f as File & { relativePath?: string }).relativePath;

describe('DropZone drag-drop directory reader (PHASE 1 — drag path evidence)', () => {
  it('stamps the correct relativePath on every nested file (incl. .DS_Store)', async () => {
    const { root, dataTransfer, get } = dropTreeAndCapture();
    await act(async () => {
      fireEvent.drop(root, { dataTransfer });
    });
    await waitFor(() => expect(get()).not.toBeNull());

    const captured = get()!;
    expect(captured.meta.directoryDropped).toBe(true);
    expect(captured.meta.unreadableDir).toBe(false);

    const paths = new Map(captured.files.map((f) => [f.name, rel(f)]));
    // Evidence table — what the reader produced for each file:
    expect(paths.get('file1')).toBe('A/file1');
    expect(paths.get('file2')).toBe('A/file2');
    expect(paths.get('.DS_Store')).toBe('A/.DS_Store'); // junk reaches the reader…
    expect(paths.get('file3')).toBe('A/B/file3');
    expect(paths.get('file4')).toBe('A/B/file4');
    expect(paths.get('file5')).toBe('A/B/D/file5'); // deepest branch
    expect(paths.get('file6')).toBe('A/C/file6');
    expect(paths.get('file7')).toBe('A/C/E/file7');
    expect(captured.files).toHaveLength(8);
  });

  it('plans the dropped tree into the correct folders and drops .DS_Store', async () => {
    const { root, dataTransfer, get } = dropTreeAndCapture();
    await act(async () => {
      fireEvent.drop(root, { dataTransfer });
    });
    await waitFor(() => expect(get()).not.toBeNull());

    const plan = planFolderImport(get()!.files);

    // …but the planner filters it: .DS_Store never enters the upload plan.
    expect(plan.files.some((p) => p.file.name === '.DS_Store')).toBe(false);
    expect(plan.files).toHaveLength(7);

    // Folders created level-by-level: [A] → [A/B, A/C] → [A/B/D, A/C/E].
    const dirPaths = plan.levels.map((lvl) => lvl.map((d) => d.path).sort());
    expect(dirPaths).toEqual([['A'], ['A/B', 'A/C'], ['A/B/D', 'A/C/E']]);

    // Each file mapped to its owning directory.
    const place = new Map(plan.files.map((p) => [p.file.name, p.dirPath]));
    expect(place.get('file1')).toBe('A');
    expect(place.get('file5')).toBe('A/B/D');
    expect(place.get('file7')).toBe('A/C/E');
  });
});
