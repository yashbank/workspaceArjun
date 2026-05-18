'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, UploadCloud } from 'lucide-react';
import { formatBytes } from '@/lib/file-utils';

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
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (note.trim()) formData.append('note', note.trim());

      const res = await fetch(`/api/files/${fileId}/versions`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? `Upload failed (${res.status})`);
      }

      onUploaded();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      setError(
        msg.includes('Failed to fetch') || msg.includes('NetworkError')
          ? 'Cannot reach server — check your connection'
          : msg,
      );
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <UploadCloud className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Upload new version</h2>
            <p className="text-[11px] text-muted-foreground/60">
              Re-upload an edited copy of <span className="font-medium text-foreground/70">{fileName}</span>
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
              onClick={() => inputRef.current?.click()}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-6 text-xs transition-all hover:border-primary/40 hover:bg-primary/3 active:scale-[0.99] ${
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
              className="w-full rounded-xl border border-border/50 bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-primary/30 focus:ring-2 focus:ring-primary/15"
              placeholder="e.g. Final client revision, updated logo"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-destructive/15 bg-destructive/4 px-3.5 py-2.5 text-xs text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent disabled:opacity-50 active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
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
