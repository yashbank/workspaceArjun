'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

export type DropMeta = { directoryDropped: boolean; unreadableDir: boolean };

export function DropZone({
  onFilesDropped,
  children,
}: {
  onFilesDropped: (files: File[], meta: DropMeta) => void;
  children: React.ReactNode;
}) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const items = e.dataTransfer.items;

      // DataTransferItem entries and files are only valid during the synchronous
      // event dispatch — any await invalidates the list. Snapshot every item's
      // entry AND file in one synchronous pass, then process with awaits.
      const captured: { entry: FileSystemEntry | null; file: File | null }[] = [];
      if (items) {
        for (const item of Array.from(items)) {
          if (item.kind !== 'file') continue;
          const anyItem = item as DataTransferItem & { getAsEntry?: () => FileSystemEntry | null };
          const entry =
            (typeof anyItem.getAsEntry === 'function'
              ? anyItem.getAsEntry()
              : typeof item.webkitGetAsEntry === 'function'
                ? item.webkitGetAsEntry()
                : null) ?? null;
          const file = entry && entry.isDirectory ? null : item.getAsFile();
          captured.push({ entry, file });
        }
      } else {
        for (const f of Array.from(e.dataTransfer.files)) {
          captured.push({ entry: null, file: f });
        }
      }

      const files: File[] = [];
      let directoryDropped = false;
      let unreadableDir = false;
      for (const c of captured) {
        if (c.entry && c.entry.isDirectory) {
          directoryDropped = true;
          const dirFiles = await readDirectoryRecursive(c.entry as FileSystemDirectoryEntry, c.entry.name);
          files.push(...dirFiles);
        } else if (c.file) {
          files.push(c.file);
        } else {
          // kind === 'file' but neither a readable entry nor a File: a folder the
          // browser refused to expand (unsupported API / non-secure context).
          unreadableDir = true;
        }
      }

      if (files.length > 0 || unreadableDir) {
        onFilesDropped(files, { directoryDropped, unreadableDir });
      }
    },
    [onFilesDropped],
  );

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className="relative"
    >
      {children}
      {dragActive && (
        <div className="absolute inset-0 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/50 bg-primary/4 backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex flex-col items-center gap-3.5">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary/10 shadow-card">
              <Upload className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold tracking-tight text-foreground">Drop files here</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">Files will be uploaded to the current folder</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function readDirectoryRecursive(
  entry: FileSystemDirectoryEntry,
  path: string,
): Promise<File[]> {
  const files: File[] = [];
  const reader = entry.createReader();

  const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    }
    readBatch();
  });

  for (const child of entries) {
    if (child.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (child as FileSystemFileEntry).file(resolve, reject);
      });
      const relativePath = `${path}/${file.name}`;
      Object.defineProperty(file, 'relativePath', { value: relativePath });
      files.push(file);
    } else if (child.isDirectory) {
      const subFiles = await readDirectoryRecursive(
        child as FileSystemDirectoryEntry,
        `${path}/${child.name}`,
      );
      files.push(...subFiles);
    }
  }

  return files;
}
