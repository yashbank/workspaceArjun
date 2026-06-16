import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, waitFor, act, fireEvent } from '@testing-library/react';

// Commit 4: single-item permanent delete now routes through the bulk path and
// removes the EXACT rows the server reports (trashed subtree included), instead
// of DELETE-then-load(). This guards: (a) the subtree descendants disappear from
// the list, (b) the bulk endpoint is used (not the per-item route), (c) exactly
// one router.refresh() fires.
const { refreshSpy, apiCalls } = vi.hoisted(() => ({
  refreshSpy: vi.fn(),
  apiCalls: [] as Array<{ url: string; init?: RequestInit }>,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshSpy }) }));

vi.mock('@/lib/api', () => ({
  apiFetch: (url: string, init?: RequestInit) => {
    apiCalls.push({ url, init });
    if (url === '/api/trash') {
      const owner = { email: 'o@e.com', name: null };
      const ts = '2026-01-01T00:00:00.000Z';
      // Folder "Parent" trashed with its subfolder "Child" and a file under Child.
      return Promise.resolve({
        folders: [
          { id: 'F1', name: 'Parent', parentId: null, deletedAt: ts, owner },
          { id: 'F2', name: 'Child', parentId: 'F1', deletedAt: ts, owner },
        ],
        files: [
          {
            id: 'fileA',
            name: 'a.pdf',
            mimeType: 'application/pdf',
            folderId: 'F2',
            deletedAt: ts,
            owner,
            currentVersion: { sizeBytes: '10', createdAt: ts },
          },
        ],
      });
    }
    if (url === '/api/trash/bulk') {
      // Server reports the full subtree it removed.
      return Promise.resolve({
        deletedFolders: 1,
        deletedFiles: 0,
        deletedFolderIds: ['F1', 'F2'],
        deletedFileIds: ['fileA'],
      });
    }
    return Promise.resolve({});
  },
}));

import { TrashBrowser } from './trash-browser';

beforeEach(() => {
  vi.clearAllMocks();
  apiCalls.length = 0;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(cleanup);

describe('TrashBrowser — single-item permanent delete (optimistic, bulk path)', () => {
  it('removes the whole trashed subtree, uses the bulk endpoint, and refreshes once', async () => {
    render(<TrashBrowser canPermanentDelete />);

    // Initial load: the folder, its subfolder, and the nested file are all listed.
    await screen.findByText('Parent');
    expect(screen.getByText('Child')).toBeTruthy();
    expect(screen.getByText('a.pdf')).toBeTruthy();

    // Click the Parent folder row's Delete button.
    const parentRow = screen.getByText('Parent').closest('tr') as HTMLElement;
    await act(async () => {
      fireEvent.click(within(parentRow).getByRole('button', { name: /delete/i }));
    });

    // The clicked folder AND its server-reported descendants disappear optimistically.
    await waitFor(() => {
      expect(screen.queryByText('Parent')).toBeNull();
      expect(screen.queryByText('Child')).toBeNull();
      expect(screen.queryByText('a.pdf')).toBeNull();
    });

    // Routed through the bulk endpoint, not the per-item DELETE route.
    const urls = apiCalls.map((c) => c.url);
    expect(urls).toContain('/api/trash/bulk');
    expect(urls.some((u) => u.startsWith('/api/trash/folders/'))).toBe(false);

    // The bulk request carried the clicked folder id under permanent_delete.
    const bulkCall = apiCalls.find((c) => c.url === '/api/trash/bulk')!;
    expect(JSON.parse(String(bulkCall.init?.body))).toMatchObject({
      action: 'permanent_delete',
      folderIds: ['F1'],
      fileIds: [],
    });

    // Exactly one deferred refresh for the server-rendered sections.
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});
