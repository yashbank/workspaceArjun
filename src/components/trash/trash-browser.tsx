'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatBytes, formatDate, getFileTypeBadge } from '@/lib/file-utils';
import {
  Folder,
  FileText,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

type TrashedFolder = {
  id: string;
  name: string;
  parentId: string | null;
  deletedAt: string;
  owner: { email: string; name: string | null };
};

type TrashedFile = {
  id: string;
  name: string;
  mimeType: string | null;
  folderId: string | null;
  deletedAt: string;
  owner: { email: string; name: string | null };
  currentVersion: { sizeBytes: string; createdAt: string } | null;
};

export function TrashBrowser() {
  const [folders, setFolders] = useState<TrashedFolder[]>([]);
  const [files, setFiles] = useState<TrashedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ folders: TrashedFolder[]; files: TrashedFile[] }>('/api/trash');
      setFolders(data.folders);
      setFiles(data.files);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching
    void load();
  }, [load]);

  function markBusy(id: string) { setBusyIds((s) => new Set(s).add(id)); }
  function clearBusy(id: string) { setBusyIds((s) => { const n = new Set(s); n.delete(id); return n; }); }

  async function handleRestoreFolder(id: string) {
    markBusy(id);
    try {
      await apiFetch(`/api/trash/folders/${id}/restore`, { method: 'POST' });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not restore folder. Please try again.');
    } finally {
      clearBusy(id);
    }
  }

  async function handlePermanentDeleteFolder(id: string) {
    if (!confirm('Permanently delete this folder? This cannot be undone.')) return;
    markBusy(id);
    try {
      await apiFetch(`/api/trash/folders/${id}`, { method: 'DELETE' });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not delete folder. Please try again.');
    } finally {
      clearBusy(id);
    }
  }

  async function handleRestoreFile(id: string) {
    markBusy(id);
    try {
      await apiFetch(`/api/trash/files/${id}/restore`, { method: 'POST' });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not restore file. Please try again.');
    } finally {
      clearBusy(id);
    }
  }

  async function handlePermanentDeleteFile(id: string) {
    if (!confirm('Permanently delete this file and all its versions? This cannot be undone.')) return;
    markBusy(id);
    try {
      await apiFetch(`/api/trash/files/${id}`, { method: 'DELETE' });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not delete file. Please try again.');
    } finally {
      clearBusy(id);
    }
  }

  const isEmpty = folders.length === 0 && files.length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="bpp-page-title">Trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted files and folders. Restore anytime, or permanently delete (owner-only).
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
        </div>
      ) : isEmpty ? (
        <div className="bpp-card flex flex-col items-center justify-center border-dashed py-28 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted/25">
            <Trash2 className="h-7 w-7 text-muted-foreground/25" />
          </div>
          <p className="mt-4 text-[15px] font-bold tracking-tight text-muted-foreground/60">Trash is empty</p>
          <p className="mt-1 text-xs text-muted-foreground/40">Items you delete will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {folders.length > 0 && (
            <section>
              <h2 className="bpp-label-caps mb-3.5">Folders</h2>
              <div className="bpp-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/15 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 md:table-cell">Deleted</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Owner</th>
                      <th className="w-32 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map((f) => (
                      <tr key={f.id} className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/8">
                              <Folder className="h-3.5 w-3.5 text-blue-500/50" />
                            </div>
                            <span className="truncate font-medium text-muted-foreground line-through decoration-muted-foreground/30">
                              {f.name}
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                          {formatDate(f.deletedAt)}
                        </td>
                        <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                          {f.owner.name ?? f.owner.email}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleRestoreFolder(f.id)}
                              disabled={busyIds.has(f.id)}
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/10 disabled:opacity-40 active:scale-[0.97]"
                            >
                              {busyIds.has(f.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                            </button>
                            <button
                              onClick={() => handlePermanentDeleteFolder(f.id)}
                              disabled={busyIds.has(f.id)}
                              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-40 active:scale-[0.97]"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section>
              <h2 className="bpp-label-caps mb-3.5">Files</h2>
              <div className="bpp-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/15 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Type</th>
                      <th className="hidden px-4 py-3 md:table-cell">Size</th>
                      <th className="hidden px-4 py-3 md:table-cell">Deleted</th>
                      <th className="hidden px-4 py-3 lg:table-cell">Owner</th>
                      <th className="w-32 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => {
                      const badge = getFileTypeBadge(f.name);
                      const size = f.currentVersion ? Number(f.currentVersion.sizeBytes) : 0;
                      return (
                        <tr key={f.id} className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                              <span className="truncate font-medium text-muted-foreground line-through decoration-muted-foreground/30" title={f.name}>
                                {f.name}
                              </span>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide opacity-50 ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">
                            {formatBytes(size)}
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                            {formatDate(f.deletedAt)}
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                            {f.owner.name ?? f.owner.email}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleRestoreFile(f.id)}
                                disabled={busyIds.has(f.id)}
                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/10 disabled:opacity-40 active:scale-[0.97]"
                              >
                                {busyIds.has(f.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                              </button>
                              <button
                                onClick={() => handlePermanentDeleteFile(f.id)}
                                disabled={busyIds.has(f.id)}
                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive transition-all hover:bg-destructive/10 disabled:opacity-40 active:scale-[0.97]"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
