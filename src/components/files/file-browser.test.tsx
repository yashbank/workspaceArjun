import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';

// Full-stack guard: mount the REAL FileBrowser and drive an upload-queue update
// through a controllable useUpload mock. If any FileBrowser list-handler loses
// its useCallback (3A) or a row loses memo (3B), the file rows would re-render on
// the queue tick and the counter assertions below would fail.
const { thumbRenders } = vi.hoisted(() => ({ thumbRenders: new Map<string, number>() }));
const { uploadCtl } = vi.hoisted(() => ({
  uploadCtl: { setQueue: null as null | ((q: Array<Record<string, unknown>>) => void) },
}));

vi.mock('./file-media-thumbnail', () => ({
  FileMediaThumbnail: ({ fileId }: { fileId: string }) => {
    thumbRenders.set(fileId, (thumbRenders.get(fileId) ?? 0) + 1);
    return null;
  },
}));
vi.mock('./file-action-menu', () => ({ FileActionMenu: () => null }));
vi.mock('./premium-file-fallback', () => ({ PremiumFileFallback: () => null }));
vi.mock('./version-panel', () => ({ VersionPanel: () => null }));

// Both real hooks return stable references (Next's router; the toast provider's
// useCallback'd toast). Mirror that — an unstable mock would itself destabilize
// FileBrowser's handlers and mask/spoof the very thing under test.
vi.mock('next/navigation', () => {
  const router = { refresh: () => {} };
  return { useRouter: () => router };
});
vi.mock('@/components/ui/toast', () => {
  const toast = () => {};
  return { useToast: () => ({ toast }) };
});
vi.mock('@/lib/direct-upload', () => ({
  uploadVersionDirect: () => Promise.resolve(),
  formatUploadError: (e: unknown) => String(e),
}));

// useUpload keeps its own queue state (so a setQueue triggers a FileBrowser
// re-render) and exposes the setter to the test. Returned handlers are stable.
vi.mock('@/lib/use-upload', async () => {
  const React = await import('react');
  return {
    useUpload: () => {
      const [queue, setQueue] = React.useState<Array<Record<string, unknown>>>([]);
      uploadCtl.setQueue = setQueue;
      const noop = React.useCallback(() => {}, []);
      return { queue, startUpload: noop, retry: noop, cancel: noop, dismiss: noop, cancelAll: noop };
    },
  };
});

// Three .png files at the root folder; folders/favorites empty.
vi.mock('@/lib/api', () => {
  const mk = (id: string) => ({
    id,
    name: `${id}.png`,
    mimeType: 'image/png',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentVersionId: `${id}-v1`,
    _count: { versions: 1 },
    currentVersion: { sizeBytes: '1024', createdAt: '2026-01-01T00:00:00.000Z' },
  });
  const files = [mk('a'), mk('b'), mk('c')];
  return {
    apiFetch: (url: string) => {
      if (url.startsWith('/api/files')) return Promise.resolve(files);
      return Promise.resolve([]); // folders, favorites
    },
  };
});

import { FileBrowser } from './file-browser';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
  // This jsdom config does not provide a working localStorage; FileBrowser reads
  // the persisted view mode on mount, so supply a minimal in-memory stub.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  cleanup();
  thumbRenders.clear();
  uploadCtl.setQueue = null;
  vi.unstubAllGlobals();
});

describe('FileBrowser — upload queue updates do not re-render file rows (3A + 3B)', () => {
  it('keeps file-row render counts flat across upload-progress ticks', async () => {
    render(<FileBrowser />);

    // Wait for the initial load to render the three rows.
    await waitFor(() => {
      expect(thumbRenders.get('a')).toBeGreaterThanOrEqual(1);
      expect(thumbRenders.get('b')).toBeGreaterThanOrEqual(1);
      expect(thumbRenders.get('c')).toBeGreaterThanOrEqual(1);
    });

    const base = {
      a: thumbRenders.get('a'),
      b: thumbRenders.get('b'),
      c: thumbRenders.get('c'),
    };

    // Two upload-progress ticks: FileBrowser re-renders, but the file list props
    // are unchanged (stable handlers, same files/favorites) so rows must skip.
    act(() => uploadCtl.setQueue?.([{ id: 'u1', name: 'x.png', size: 10, status: 'uploading', progress: 50 }]));
    act(() => uploadCtl.setQueue?.([{ id: 'u1', name: 'x.png', size: 10, status: 'uploading', progress: 75 }]));

    expect(thumbRenders.get('a')).toBe(base.a);
    expect(thumbRenders.get('b')).toBe(base.b);
    expect(thumbRenders.get('c')).toBe(base.c);
  });
});
