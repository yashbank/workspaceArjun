import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';

// Drive the REAL FolderImportDialog with a controllable apiFetch so one folder
// creation fails. Asserts the dialog no longer swallows the failure: the rest of
// the import still uploads, and the summary toast reports the failed-folder count
// plus a human reason — the behaviour added in Commit 2.
const { toastSpy, uploadSpy, apiState } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  uploadSpy: vi.fn((..._args: unknown[]) => Promise.resolve()),
  // Which folder name's create rejects, and with what error (mutable per test).
  apiState: { failName: 'fail', failError: new Error('boom') as unknown },
}));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ toast: toastSpy }) }));
vi.mock('@/lib/direct-upload', () => ({
  uploadFileDirect: (...args: unknown[]) => uploadSpy(...args),
  formatUploadError: (e: unknown) => String(e),
}));
vi.mock('@/lib/api', () => ({
  apiFetch: (url: string, init?: RequestInit) => {
    if (url === '/api/folders') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { name: string };
      if (body.name === apiState.failName) return Promise.reject(apiState.failError);
      return Promise.resolve({ id: `id-${body.name}` });
    }
    return Promise.resolve({});
  },
}));

import { FolderImportDialog } from './folder-import-dialog';

/** A File carrying a folder-import `relativePath`, as drag-drop import supplies. */
function importFile(path: string): File {
  const name = path.split('/').pop() ?? 'file';
  const f = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(f, 'relativePath', { value: path, configurable: true });
  return f;
}

// Tree: Imp/keep/k.txt + Imp/fail/f.txt → folders Imp, Imp/keep, Imp/fail.
// The "fail" folder's create is the one rejected.
const files = [importFile('Imp/keep/k.txt'), importFile('Imp/fail/f.txt')];

async function importAndAwaitToast() {
  render(
    <FolderImportDialog files={files} parentFolderId={null} onComplete={() => {}} onCancel={() => {}} />,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  });
  await waitFor(() => expect(toastSpy).toHaveBeenCalled());
  return toastSpy.mock.calls.at(-1) as [string, string];
}

beforeEach(() => {
  vi.clearAllMocks();
  apiState.failName = 'fail';
  apiState.failError = new Error('boom');
});
afterEach(cleanup);

describe('FolderImportDialog — folder-create failure reporting', () => {
  it('reports the failed folder and still uploads the rest', async () => {
    const [level, message] = await importAndAwaitToast();

    // One folder failed → still uploaded the file under the folder that succeeded.
    expect(uploadSpy).toHaveBeenCalledTimes(1);

    expect(level).toBe('error');
    expect(message).toContain('1 folder not created');
    // Generic reason for a non-auth error, plus the failed path (≤2 shown).
    expect(message).toContain('a network or server error occurred');
    expect(message).toContain('Imp/fail');
  });

  it('distinguishes a Forbidden folder-create failure', async () => {
    apiState.failError = new Error('Forbidden');

    const [level, message] = await importAndAwaitToast();

    expect(level).toBe('error');
    expect(message).toContain('1 folder not created');
    expect(message).toContain("you don't have permission to create folders here");
  });
});
