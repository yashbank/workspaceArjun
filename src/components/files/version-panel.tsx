'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatBytes, formatDate } from '@/lib/file-utils';
import { Download, Clock, RotateCcw, Loader2 } from 'lucide-react';

type Version = {
  id: string;
  versionNo: number;
  sizeBytes: string;
  note: string | null;
  createdAt: string;
  uploader: { email: string; name: string | null };
};

export function VersionPanel({
  fileId,
  fileName,
  currentVersionId,
  onVersionRestored,
}: {
  fileId: string;
  fileName: string;
  currentVersionId?: string | null;
  onVersionRestored?: () => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Version[]>(`/api/files/${fileId}/versions`);
      setVersions(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching
    void load();
  }, [load]);

  async function handleDownload(versionId: string) {
    try {
      const res = await fetch(`/api/versions/${versionId}/download`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        alert(payload?.error ?? 'Download failed');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?(.+?)"?$/);
      const filename = match?.[1] ? decodeURIComponent(match[1]) : fileName;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed — check your connection');
    }
  }

  async function handleRestore(versionId: string) {
    if (!confirm('Restore this version? It will become the current version without deleting any history.')) return;
    try {
      setRestoringId(versionId);
      await apiFetch(`/api/versions/${versionId}/restore`, { method: 'POST' });
      onVersionRestored?.();
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }

  if (loading) {
    return <p className="py-3 text-xs text-muted-foreground">Loading versions...</p>;
  }

  if (error) {
    return <p className="py-3 text-xs text-destructive">{error}</p>;
  }

  if (versions.length === 0) {
    return <p className="py-3 text-xs text-muted-foreground">No versions found.</p>;
  }

  return (
    <div className="py-3">
      <p className="mb-2 text-[11px] font-medium text-muted-foreground/60">
        Version history for {fileName}
      </p>
      <div className="space-y-1">
        {versions.map((v) => {
          const isCurrent = currentVersionId ? v.id === currentVersionId : false;
          return (
            <div
              key={v.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition-all ${isCurrent ? 'bg-primary/5 shadow-card ring-1 ring-primary/20' : 'hover:bg-accent/30'}`}
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">
                  v{v.versionNo}
                  {isCurrent && (
                    <span className="ml-1.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      Current
                    </span>
                  )}
                </span>
                <span className="ml-2 text-muted-foreground/50">
                  {formatBytes(Number(v.sizeBytes))} &middot;{' '}
                  {formatDate(v.createdAt)} &middot;{' '}
                  {v.uploader.name ?? v.uploader.email}
                </span>
                {v.note && (
                  <span className="ml-2 italic text-muted-foreground/50">&ldquo;{v.note}&rdquo;</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!isCurrent && (
                  <button
                    onClick={() => handleRestore(v.id)}
                    disabled={restoringId === v.id}
                    className="rounded-lg p-1.5 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground disabled:opacity-50 active:scale-90"
                    title={`Restore v${v.versionNo} as current`}
                  >
                    {restoringId === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                <button
                  onClick={() => handleDownload(v.id)}
                  className="rounded-lg p-1.5 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground active:scale-90"
                  title={`Download v${v.versionNo}`}
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
