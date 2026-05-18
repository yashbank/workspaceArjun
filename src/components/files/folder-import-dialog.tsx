'use client';

import { useState } from 'react';
import { FolderUp, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/toast';

export function FolderImportDialog({
  files,
  parentFolderId,
  onComplete,
  onCancel,
}: {
  files: File[];
  parentFolderId: string | null;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const folderName = detectFolderName(files);
  const fileCount = files.length;

  async function handleConfirm() {
    setUploading(true);
    setProgress(0);

    try {
      const { id: folderId } = await apiFetch<{ id: string }>('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, parentId: parentFolderId }),
      });

      let done = 0;
      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('folderId', folderId);
          const res = await fetch('/api/files', { method: 'POST', body: formData });
          if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error(payload?.error ?? `Upload failed (${res.status})`);
          }
        } catch {
          // continue with remaining files
        }
        done++;
        setProgress(done);
      }

      toast('success', `Imported folder "${folderName}" with ${done} files`);
      onComplete();
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Folder import failed');
      onCancel();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <FolderUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Import folder</h2>
            <p className="text-[11px] text-muted-foreground/60">
              Create &ldquo;{folderName}&rdquo; and upload {fileCount} file{fileCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {uploading && (
          <div className="border-b border-border/20 px-5 py-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground/50">
              <span className="font-medium">Uploading…</span>
              <span className="tabular-nums">{progress}/{fileCount}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted/25">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(progress / fileCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent disabled:opacity-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
          >
            {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {uploading ? 'Uploading…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

function detectFolderName(files: File[]): string {
  const first = files[0];
  if (!first) return 'Imported Folder';

  const relativePath =
    (first as File & { relativePath?: string }).relativePath ??
    (first as File & { webkitRelativePath?: string }).webkitRelativePath ??
    '';

  if (relativePath) {
    const parts = relativePath.split('/').filter(Boolean);
    if (parts.length >= 2) return parts[0];
  }

  return 'Imported Folder';
}
