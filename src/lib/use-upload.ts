'use client';

import { useCallback, useRef, useState } from 'react';
import type { UploadItem } from '@/components/files/upload-queue';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500 MB

export function useUpload(folderId: string | null, onComplete: () => void) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  const abortRef = useRef(false);

  const uploadFile = useCallback(async (id: string, file: File, targetFolderId: string | null) => {
    setQueue((q) => q.map((i) => (i.id === id ? { ...i, status: 'uploading' as const, progress: 0 } : i)));

    try {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds 500 MB limit');
      }

      const formData = new FormData();
      formData.append('file', file);
      if (targetFolderId) formData.append('folderId', targetFolderId);

      const res = await fetch('/api/files', { method: 'POST', body: formData });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errMsg = payload?.error ?? `Upload failed (${res.status})`;
        throw new Error(errMsg);
      }

      setQueue((q) => q.map((i) => (i.id === id ? { ...i, status: 'success' as const, progress: 100 } : i)));
    } catch (err: unknown) {
      let msg = 'Upload failed';
      if (err instanceof Error) {
        msg = err.message.includes('Failed to fetch') || err.message.includes('NetworkError')
          ? 'Cannot reach server — check your connection'
          : err.message;
      }
      setQueue((q) => q.map((i) => (i.id === id ? { ...i, status: 'error' as const, error: msg } : i)));
    }
  }, []);

  const startUpload = useCallback(
    async (files: File[]) => {
      abortRef.current = false;
      const items: UploadItem[] = files.map((file) => {
        const id = crypto.randomUUID();
        filesRef.current.set(id, file);
        return { id, name: file.name, size: file.size, status: 'pending' as const, progress: 0 };
      });

      setQueue((prev) => [...prev, ...items]);

      for (const item of items) {
        if (abortRef.current) break;
        const file = filesRef.current.get(item.id);
        if (file) await uploadFile(item.id, file, folderId);
      }

      onComplete();
    },
    [folderId, onComplete, uploadFile],
  );

  const retry = useCallback(
    async (id: string) => {
      const file = filesRef.current.get(id);
      if (!file) return;
      await uploadFile(id, file, folderId);
      onComplete();
    },
    [folderId, uploadFile, onComplete],
  );

  const dismiss = useCallback(() => {
    setQueue([]);
    filesRef.current.clear();
  }, []);

  return { queue, startUpload, retry, dismiss };
}
