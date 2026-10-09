'use client';
import { useEffect, useState } from 'react';

/**
 * V2 Epic 7 — take or choose the badge photo. `capture="user"` opens the front camera on a phone;
 * on a desktop it is a plain file picker. The server squares it to 256×256 WebP; the preview here
 * is only the raw pick.
 */
export function PhotoPicker({ file, onChange, currentUrl }: { file: File | null; onChange: (f: File | null) => void; currentUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const shown = preview ?? currentUrl;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs text-slate-400">
        {/* eslint-disable-next-line @next/next/no-img-element -- a same-origin blob/API image; next/image adds nothing here */}
        {shown ? <img src={shown} alt="Badge photo" className="h-full w-full object-cover" /> : 'No photo'}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700">
        {file ? 'Change photo' : currentUrl ? 'Retake photo' : 'Take photo'}
        <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
      {file && <button type="button" className="min-h-11 text-sm text-slate-500 underline" onClick={() => onChange(null)}>Remove</button>}
    </div>
  );
}
