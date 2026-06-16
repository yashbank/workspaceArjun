import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';

/**
 * PRODUCTION REPRO — nested folder import must preserve the full hierarchy and
 * filter OS junk, through the REAL FolderImportDialog orchestration (real
 * planFolderImport). Mirrors the exact reported tree:
 *
 *   A/
 *   ├─ file1, file2
 *   ├─ .DS_Store            (junk — must NEVER upload)
 *   ├─ B/
 *   │  ├─ file3, file4
 *   │  ├─ .DS_Store         (junk)
 *   │  └─ D/ └─ file5
 *   └─ C/
 *      ├─ file6
 *      └─ E/ └─ file7
 *
 * Expected: folders A,B,C,D,E created with correct parents; every file lands in
 * its own folder; no .DS_Store uploaded; flat/picker behave identically.
 */
const { toastSpy, folderCreates, uploads } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  folderCreates: [] as Array<{ name: string; parentId: string | null }>,
  uploads: [] as Array<{ name: string; folderId: string | null }>,
}));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/lib/direct-upload', () => ({
  // Record where each file is routed (folderId encodes the hierarchy).
  uploadFileDirect: (file: File, folderId: string | null) => {
    uploads.push({ name: file.name, folderId });
    return Promise.resolve();
  },
  formatUploadError: (e: unknown) => String(e),
}));
vi.mock('@/lib/api', () => ({
  // Deterministic folder ids by name (all names unique in this tree); record the
  // (name, parentId) of every create so we can assert the reconstructed tree.
  apiFetch: (url: string, init?: RequestInit) => {
    if (url === '/api/folders') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name: string; parentId: string | null };
      folderCreates.push({ name: body.name, parentId: body.parentId });
      return Promise.resolve({ id: `fid-${body.name}` });
    }
    return Promise.resolve({});
  },
}));

import { FolderImportDialog } from './folder-import-dialog';

/** A File carrying folder structure under `pathProp` (relativePath = drag-drop, webkitRelativePath = picker). */
function makeFile(path: string, pathProp: 'relativePath' | 'webkitRelativePath'): File {
  const name = path.split('/').pop() ?? 'file';
  const f = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(f, pathProp, { value: path, configurable: true });
  return f;
}

function buildTree(pathProp: 'relativePath' | 'webkitRelativePath'): File[] {
  return [
    makeFile('A/file1', pathProp),
    makeFile('A/file2', pathProp),
    makeFile('A/.DS_Store', pathProp), // junk
    makeFile('A/B/file3', pathProp),
    makeFile('A/B/file4', pathProp),
    makeFile('A/B/.DS_Store', pathProp), // junk
    makeFile('A/B/D/file5', pathProp),
    makeFile('A/C/file6', pathProp),
    makeFile('A/C/E/file7', pathProp),
  ];
}

async function runImport(files: File[]) {
  render(
    <FolderImportDialog files={files} parentFolderId={null} onComplete={() => {}} onCancel={() => {}} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  });
  await waitFor(() => expect(uploads.length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  folderCreates.length = 0;
  uploads.length = 0;
});
afterEach(cleanup);

describe('nested folder import — hierarchy preservation + junk filtering (production repro)', () => {
  for (const pathProp of ['relativePath', 'webkitRelativePath'] as const) {
    it(`reconstructs the full tree and drops junk (${pathProp === 'relativePath' ? 'drag-drop' : 'folder picker'})`, async () => {
      await runImport(buildTree(pathProp));

      // --- Folders: exactly A,B,C,D,E with correct parents ---
      const byName = new Map(folderCreates.map((c) => [c.name, c.parentId]));
      expect(folderCreates).toHaveLength(5);
      expect(byName.get('A')).toBeNull(); // top level → import target (root)
      expect(byName.get('B')).toBe('fid-A');
      expect(byName.get('C')).toBe('fid-A');
      expect(byName.get('D')).toBe('fid-B'); // deeply nested
      expect(byName.get('E')).toBe('fid-C'); // deeply nested

      // --- Files: each lands in its own folder; .DS_Store NEVER uploads ---
      const fileToFolder = new Map(uploads.map((u) => [u.name, u.folderId]));
      expect(uploads).toHaveLength(7);
      expect(uploads.some((u) => u.name === '.DS_Store')).toBe(false);
      expect(fileToFolder.get('file1')).toBe('fid-A');
      expect(fileToFolder.get('file2')).toBe('fid-A');
      expect(fileToFolder.get('file3')).toBe('fid-B');
      expect(fileToFolder.get('file4')).toBe('fid-B');
      expect(fileToFolder.get('file5')).toBe('fid-D');
      expect(fileToFolder.get('file6')).toBe('fid-C');
      expect(fileToFolder.get('file7')).toBe('fid-E');

      // Nothing flattened to the import root: only A sits at root.
      expect(uploads.filter((u) => u.folderId === null)).toHaveLength(0);
    });
  }

  it('drag-drop and folder picker produce identical folder/file placement', async () => {
    await runImport(buildTree('relativePath'));
    const dragFolders = [...folderCreates].sort((a, b) => a.name.localeCompare(b.name));
    const dragUploads = [...uploads].sort((a, b) => a.name.localeCompare(b.name));

    folderCreates.length = 0;
    uploads.length = 0;
    cleanup();

    await runImport(buildTree('webkitRelativePath'));
    const pickerFolders = [...folderCreates].sort((a, b) => a.name.localeCompare(b.name));
    const pickerUploads = [...uploads].sort((a, b) => a.name.localeCompare(b.name));

    expect(pickerFolders).toEqual(dragFolders);
    expect(pickerUploads).toEqual(dragUploads);
  });

  it('handles a folder that contains only a subfolder (no direct files)', async () => {
    // X/ has NO direct files, only Y/file — X must still be created as a parent.
    await runImport([
      makeFile('X/Y/only', 'relativePath'),
    ]);
    const byName = new Map(folderCreates.map((c) => [c.name, c.parentId]));
    expect(byName.get('X')).toBeNull();
    expect(byName.get('Y')).toBe('fid-X');
    expect(uploads).toEqual([{ name: 'only', folderId: 'fid-Y' }]);
  });
});
