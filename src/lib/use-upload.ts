'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadItem } from '@/components/files/upload-queue';
import { formatUploadError, uploadFileDirect } from '@/lib/direct-upload';

export function useUpload(folderId: string | null, onComplete: () => void) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledRef = useRef<Set<string>>(new Set());

  const uploadFile = useCallback(
    async (id: string, file: File, targetFolderId: string | null) => {
      if (cancelledRef.current.has(id)) return;

      const controller = new AbortController();
      abortControllersRef.current.set(id, controller);

      setQueue((q) =>
        q.map((i) =>
          i.id === id ? { ...i, status: 'uploading' as const, progress: 0, error: undefined } : i,
        ),
      );

      try {
        await uploadFileDirect(
          file,
          targetFolderId,
          (percent) => {
            setQueue((q) =>
              q.map((i) => (i.id === id ? { ...i, progress: percent } : i)),
            );
          },
          controller.signal,
        );

        if (cancelledRef.current.has(id)) return;

        setQueue((q) =>
          q.map((i) => (i.id === id ? { ...i, status: 'success' as const, progress: 100 } : i)),
        );
      } catch (err: unknown) {
        if (cancelledRef.current.has(id)) return;
        const msg = formatUploadError(err);
        setQueue((q) =>
          q.map((i) => (i.id === id ? { ...i, status: 'error' as const, error: msg } : i)),
        );
      } finally {
        abortControllersRef.current.delete(id);
      }
    },
    [],
  );

  const startUpload = useCallback(
    async (files: File[]) => {
      cancelledRef.current.clear();
      const items: UploadItem[] = files.map((file) => {
        const id = crypto.randomUUID();
        filesRef.current.set(id, file);
        return {
          id,
          name: file.name,
          size: file.size,
          status: 'pending' as const,
          progress: 0,
        };
      });

      setQueue((prev) => [...prev, ...items]);

      // Bounded-concurrency pool: up to 3 files upload at once. Workers pull from
      // a shared cursor until the list drains. Per-file progress, cancellation
      // (cancelledRef + AbortController inside uploadFile) and the single
      // onComplete after all finish are unchanged from the previous serial loop.
      const MAX_CONCURRENT = 3;
      let cursor = 0;
      async function worker() {
        while (cursor < items.length) {
          const item = items[cursor++];
          if (cancelledRef.current.has(item.id)) continue;
          const file = filesRef.current.get(item.id);
          if (file) await uploadFile(item.id, file, folderId);
        }
      }
      await Promise.all(
        Array.from({ length: Math.min(MAX_CONCURRENT, items.length) }, () => worker()),
      );

      onComplete();
    },
    [folderId, onComplete, uploadFile],
  );

  const retry = useCallback(
    async (id: string) => {
      cancelledRef.current.delete(id);
      const file = filesRef.current.get(id);
      if (!file) return;
      await uploadFile(id, file, folderId);
      onComplete();
    },
    [folderId, uploadFile, onComplete],
  );

  const cancel = useCallback((id: string) => {
    cancelledRef.current.add(id);
    const controller = abortControllersRef.current.get(id);
    controller?.abort();
    setQueue((q) => q.filter((i) => i.id !== id));
    filesRef.current.delete(id);
    abortControllersRef.current.delete(id);
  }, []);

  const cancelAll = useCallback(() => {
    for (const id of abortControllersRef.current.keys()) {
      cancelledRef.current.add(id);
      abortControllersRef.current.get(id)?.abort();
    }
    abortControllersRef.current.clear();
    filesRef.current.clear();
    setQueue([]);
  }, []);

  const dismiss = useCallback(() => {
    cancelAll();
  }, [cancelAll]);

  return { queue, startUpload, retry, cancel, cancelAll, dismiss };
}
