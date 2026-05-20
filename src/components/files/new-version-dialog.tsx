'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, UploadCloud } from 'lucide-react';
import { formatBytes } from '@/lib/file-utils';
import { formatUploadError, uploadVersionDirect } from '@/lib/direct-upload';

export function NewVersionDialog({
  fileId,
  fileName,
  onUploaded,
  onClose,
}: {
  fileId: string;
  fileName: string;
  onUploaded: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError(null);
    setProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await uploadVersionDirect(
        selectedFile,
        fileId,
        note.trim() || undefined,
        setProgress,
        controller.signal,
      );
      onUploaded();
    } catch (e: unknown) {
      const msg = formatUploadError(e);
      if (msg !== 'Upload cancelled') {
        setError(msg);
      }
      setUploading(false);
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleCancel}
    >
      <div
        className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <UploadCloud className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Upload new version</h2>
            <p className="text-[11px] text-muted-foreground/60">
              Re-upload an edited copy of{' '}
              <span className="font-medium text-foreground/70">{fileName}</span>
            </p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-6 text-xs transition-all hover:border-primary/40 hover:bg-primary/3 active:scale-[0.99] disabled:opacity-50 ${
                selectedFile ? 'border-primary/30 bg-primary/3' : 'border-border/40 text-muted-foreground'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span className="font-medium">{selectedFile ? selectedFile.name : 'Choose file'}</span>
            </button>
            {selectedFile && (
              <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                {formatBytes(selectedFile.size)} &middot; {selectedFile.type || 'unknown type'}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="version-note" className="mb-1.5 block text-xs font-medium">
              Note <span className="font-normal text-muted-foreground/50">(optional)</span>
            </label>
            <input
              id="version-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={uploading}
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15 disabled:opacity-50"
              placeholder="e.g. Final client revision, updated logo"
            />
          </div>

          {uploading && (
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={uploading}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent disabled:opacity-50 active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated disabled:opacity-50 active:scale-[0.97]"
            >
              {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {uploading ? 'Uploading…' : 'Upload version'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
