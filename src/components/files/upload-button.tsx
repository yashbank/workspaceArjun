'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export function UploadButton({
  folderId,
  onUploadComplete,
}: {
  folderId: string | null;
  onUploadComplete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    const total = fileList.length;
    let uploaded = 0;

    for (const file of Array.from(fileList)) {
      setProgress(`Uploading ${uploaded + 1}/${total}: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (folderId) formData.append('folderId', folderId);

        const res = await fetch('/api/files', { method: 'POST', body: formData });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error ?? `Upload failed (${res.status})`);
        }
        uploaded++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        alert(`Failed to upload ${file.name}: ${msg}`);
      }
    }

    setUploading(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
    if (uploaded > 0) onUploadComplete();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        <Upload className="h-4 w-4" />
        {uploading ? progress ?? 'Uploading...' : 'Upload'}
      </button>
    </>
  );
}
