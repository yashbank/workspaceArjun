'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatBytes, formatDate, getFileTypeBadge } from '@/lib/file-utils';
import {
  Folder,
  FileText,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Loader2,
  X,
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

type SelectedKey = `folder:${string}` | `file:${string}`;

function toKey(type: 'folder' | 'file', id: string): SelectedKey {
  return `${type}:${id}`;
}

export function TrashBrowser({ canPermanentDelete }: { canPermanentDelete: boolean }) {
  const [folders, setFolders] = useState<TrashedFolder[]>([]);
  const [files, setFiles] = useState<TrashedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<SelectedKey>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const allKeys = useMemo(() => {
    const keys: SelectedKey[] = [];
    folders.forEach((f) => keys.push(toKey('folder', f.id)));
    files.forEach((f) => keys.push(toKey('file', f.id)));
    return keys;
  }, [folders, files]);

  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ folders: TrashedFolder[]; files: TrashedFile[] }>('/api/trash');
      setFolders(data.folders);
      setFiles(data.files);
      setSelected(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on mount
    void load();
  }, [load]);

  function markBusy(id: string) {
    setBusyIds((s) => new Set(s).add(id));
  }
  function clearBusy(id: string) {
    setBusyIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }

  function toggleSelect(key: SelectedKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allKeys));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function parseSelection() {
    const folderIds: string[] = [];
    const fileIds: string[] = [];
    for (const key of selected) {
      if (key.startsWith('folder:')) folderIds.push(key.slice(7));
      if (key.startsWith('file:')) fileIds.push(key.slice(5));
    }
    return { folderIds, fileIds };
  }

  async function handleRestoreFolder(id: string) {
    markBusy(id);
    try {
      await apiFetch(`/api/trash/folders/${id}/restore`, { method: 'POST' });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not restore folder.');
    } finally {
      clearBusy(id);
    }
  }

  async function handlePermanentDeleteFolder(id: string) {
    if (!canPermanentDelete) return;
    if (!confirm('Permanently delete this folder? This cannot be undone.')) return;
    markBusy(id);
    try {
      await apiFetch(`/api/trash/folders/${id}`, { method: 'DELETE' });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not delete folder.');
    } finally {
      clearBusy(id);
    }
  }

  async function handleRestoreFile(id: string) {
    markBusy(id);
    try {
      await apiFetch(`/api/trash/files/${id}/restore`, { method: 'POST' });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not restore file.');
    } finally {
      clearBusy(id);
    }
  }

  async function handlePermanentDeleteFile(id: string) {
    if (!canPermanentDelete) return;
    if (
      !confirm(
        'This permanently removes the file from storage and cannot be undone. Delete this file and all its versions?',
      )
    ) {
      return;
    }
    markBusy(id);
    try {
      await apiFetch(`/api/trash/files/${id}`, { method: 'DELETE' });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Could not delete file.');
    } finally {
      clearBusy(id);
    }
  }

  async function handleBulkRestore() {
    const { folderIds, fileIds } = parseSelection();
    if (folderIds.length === 0 && fileIds.length === 0) return;
    setBulkBusy(true);
    try {
      await apiFetch('/api/trash/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', folderIds, fileIds }),
      });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Bulk restore failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkPermanentDelete() {
    if (!canPermanentDelete) return;
    const { folderIds, fileIds } = parseSelection();
    const n = folderIds.length + fileIds.length;
    if (
      !confirm(
        `This permanently removes ${n} selected item${n === 1 ? '' : 's'} from storage and cannot be undone. Continue?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      await apiFetch('/api/trash/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'permanent_delete', folderIds, fileIds }),
      });
      await load();
      // Restores/deletes change Files, Dashboard counts and Activity — refresh
      // those server-rendered sections.
      router.refresh();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Bulk delete failed.');
    } finally {
      setBulkBusy(false);
    }
  }

  const isEmpty = folders.length === 0 && files.length === 0;
  const selectedCount = selected.size;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="bpp-page-title">Trash</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted files and folders. Restore anytime
          {canPermanentDelete ? ', or permanently delete (owner-only).' : '.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !isEmpty && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
            selectedCount > 0
              ? 'border-primary/25 bg-primary/4 shadow-card'
              : 'border-border/40 bg-card/50'
          }`}
        >
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={selectedCount === allKeys.length && allKeys.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = selectedCount > 0 && selectedCount < allKeys.length;
              }}
              onChange={() => {
                if (selectedCount === allKeys.length) clearSelection();
                else selectAll();
              }}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {selectedCount === 0
                ? `Select all (${allKeys.length})`
                : `${selectedCount} selected`}
            </span>
          </label>

          {selectedCount > 0 && (
            <>
              <div className="h-4 w-px bg-border/50" />
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void handleBulkRestore()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-card disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Restore selected
              </button>
              {canPermanentDelete && (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleBulkPermanentDelete()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive transition-all hover:bg-destructive/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete forever
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-8">
          {[0, 1].map((s) => (
            <section key={s}>
              <div className="mb-3.5 h-2.5 w-16 rounded bg-shimmer bg-[length:200%_100%] animate-shimmer" />
              <div className="bpp-card overflow-hidden">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-border/30 px-4 py-3 last:border-0"
                  >
                    <div className="h-4 w-4 shrink-0 rounded bg-shimmer bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: `${i * 70}ms` }} />
                    <div className="h-3.5 flex-1 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer" style={{ maxWidth: `${40 + i * 12}%`, animationDelay: `${i * 70 + 20}ms` }} />
                    <div className="hidden h-3 w-20 shrink-0 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer md:block" style={{ animationDelay: `${i * 70 + 40}ms` }} />
                    <div className="hidden h-3 w-16 shrink-0 rounded-full bg-shimmer bg-[length:200%_100%] animate-shimmer sm:block" style={{ animationDelay: `${i * 70 + 50}ms` }} />
                    <div className="h-7 w-28 shrink-0 rounded-lg bg-shimmer bg-[length:200%_100%] animate-shimmer" style={{ animationDelay: `${i * 70 + 60}ms` }} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : isEmpty ? (
        <div className="bpp-card flex flex-col items-center justify-center border-dashed py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-muted/25">
            <Trash2 className="h-7 w-7 text-muted-foreground/25" />
          </div>
          <p className="mt-4 text-[15px] font-bold tracking-tight text-muted-foreground/60">Trash is empty</p>
          <p className="mt-1 text-xs text-muted-foreground/40">Items you delete will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {folders.length > 0 && (
            <section>
              <h2 className="bpp-label-caps mb-3.5">Folders</h2>
              <div className="bpp-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/15 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                      <th className="w-10 px-4 py-3" />
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 md:table-cell">Deleted</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Owner</th>
                      <th className="w-36 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {folders.map((f) => {
                      const key = toKey('folder', f.id);
                      return (
                        <tr
                          key={f.id}
                          className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleSelect(key)}
                              className="h-4 w-4 rounded accent-primary"
                            />
                          </td>
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
                                type="button"
                                onClick={() => handleRestoreFolder(f.id)}
                                disabled={busyIds.has(f.id) || bulkBusy}
                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                              >
                                {busyIds.has(f.id) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}{' '}
                                Restore
                              </button>
                              {canPermanentDelete && (
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDeleteFolder(f.id)}
                                  disabled={busyIds.has(f.id) || bulkBusy}
                                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" /> Delete
                                </button>
                              )}
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

          {files.length > 0 && (
            <section>
              <h2 className="bpp-label-caps mb-3.5">Files</h2>
              <div className="bpp-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/15 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45">
                      <th className="w-10 px-4 py-3" />
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Type</th>
                      <th className="hidden px-4 py-3 md:table-cell">Size</th>
                      <th className="hidden px-4 py-3 md:table-cell">Deleted</th>
                      <th className="w-36 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => {
                      const badge = getFileTypeBadge(f.name);
                      const size = f.currentVersion ? Number(f.currentVersion.sizeBytes) : 0;
                      const key = toKey('file', f.id);
                      return (
                        <tr
                          key={f.id}
                          className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0"
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleSelect(key)}
                              className="h-4 w-4 rounded accent-primary"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                              <span className="truncate font-medium text-muted-foreground line-through" title={f.name}>
                                {f.name}
                              </span>
                            </div>
                          </td>
                          <td className="hidden px-4 py-3 sm:table-cell">
                            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase opacity-50 ${badge.color}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="hidden px-4 py-3 text-xs tabular-nums text-muted-foreground md:table-cell">
                            {size > 0 ? formatBytes(size) : '—'}
                          </td>
                          <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
                            {formatDate(f.deletedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleRestoreFile(f.id)}
                                disabled={busyIds.has(f.id) || bulkBusy}
                                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
                              >
                                {busyIds.has(f.id) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3.5 w-3.5" />
                                )}{' '}
                                Restore
                              </button>
                              {canPermanentDelete && (
                                <button
                                  type="button"
                                  onClick={() => handlePermanentDeleteFile(f.id)}
                                  disabled={busyIds.has(f.id) || bulkBusy}
                                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
                                >
                                  <AlertTriangle className="h-3.5 w-3.5" /> Delete
                                </button>
                              )}
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
