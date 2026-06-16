'use client';

import { memo, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useConfirm } from '@/components/ui/confirm-dialog';
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

const CHUNK_SIZE = 100;

// Memoized rows — receive their own item + per-row booleans + the parent's stable
// callbacks, so a selection/optimistic-removal re-render only repaints the rows
// whose props actually changed (not the whole table).
const TrashFolderRow = memo(function TrashFolderRow({
  folder,
  selected,
  busy,
  disabled,
  canPermanentDelete,
  onToggle,
  onRestore,
  onDelete,
}: {
  folder: TrashedFolder;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  canPermanentDelete: boolean;
  onToggle: (key: SelectedKey) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(toKey('folder', folder.id))}
          className="h-4 w-4 rounded accent-primary"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/8">
            <Folder className="h-3.5 w-3.5 text-blue-500/50" />
          </div>
          <span
            className="truncate font-medium text-muted-foreground line-through decoration-muted-foreground/30"
            title={folder.name}
          >
            {folder.name}
          </span>
        </div>
      </td>
      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">
        {formatDate(folder.deletedAt)}
      </td>
      <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
        {folder.owner.name ?? folder.owner.email}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onRestore(folder.id)}
            disabled={disabled}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}{' '}
            Restore
          </button>
          {canPermanentDelete && (
            <button
              type="button"
              onClick={() => onDelete(folder.id)}
              disabled={disabled}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

const TrashFileRow = memo(function TrashFileRow({
  file,
  selected,
  busy,
  disabled,
  canPermanentDelete,
  onToggle,
  onRestore,
  onDelete,
}: {
  file: TrashedFile;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  canPermanentDelete: boolean;
  onToggle: (key: SelectedKey) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const badge = getFileTypeBadge(file.name);
  const size = file.currentVersion ? Number(file.currentVersion.sizeBytes) : 0;
  return (
    <tr className="border-b border-border/30 transition-colors hover:bg-accent/15 last:border-0">
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(toKey('file', file.id))}
          className="h-4 w-4 rounded accent-primary"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          <span className="truncate font-medium text-muted-foreground line-through" title={file.name}>
            {file.name}
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
        {formatDate(file.deletedAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => onRestore(file.id)}
            disabled={disabled}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}{' '}
            Restore
          </button>
          {canPermanentDelete && (
            <button
              type="button"
              onClick={() => onDelete(file.id)}
              disabled={disabled}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

export function TrashBrowser({ canPermanentDelete }: { canPermanentDelete: boolean }) {
  const [folders, setFolders] = useState<TrashedFolder[]>([]);
  const [files, setFiles] = useState<TrashedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<SelectedKey>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const allKeys = useMemo(() => {
    const keys: SelectedKey[] = [];
    folders.forEach((f) => keys.push(toKey('folder', f.id)));
    files.forEach((f) => keys.push(toKey('file', f.id)));
    return keys;
  }, [folders, files]);

  const router = useRouter();
  // Non-blocking confirmation (replaces window.confirm, which blocks the main
  // thread and inflates INP on delete interactions).
  const { confirm, confirmDialog } = useConfirm();

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

  // Warn on accidental refresh/navigation while a bulk operation is mid-flight.
  // Active only during the operation; removed as soon as it settles.
  useEffect(() => {
    if (!bulkBusy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [bulkBusy]);

  const markBusy = useCallback((id: string) => {
    setBusyIds((s) => new Set(s).add(id));
  }, []);
  const clearBusy = useCallback((id: string) => {
    setBusyIds((s) => {
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  const toggleSelect = useCallback((key: SelectedKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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

  // Shared optimistic permanent-delete core: chunk the selection, POST each chunk
  // to the bulk endpoint, and drop the EXACT rows the server reports as removed —
  // a trashed folder's descendants also appear in this list, so we rely on the
  // server-returned subtree ids rather than just the clicked id. Removal runs in a
  // transition. Owns neither the busy/progress UI nor the refresh (callers do), so
  // single-item and bulk deletes share the core while keeping their own
  // affordances. Throws on the first failed chunk so the caller can resync.
  const executeOptimisticPermanentDelete = useCallback(
    async (folderIds: string[], fileIds: string[], onChunkDone?: (count: number) => void) => {
      const items: Array<['folder' | 'file', string]> = [
        ...folderIds.map((id) => ['folder', id] as ['folder', string]),
        ...fileIds.map((id) => ['file', id] as ['file', string]),
      ];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const slice = items.slice(i, i + CHUNK_SIZE);
        const chunk = {
          folderIds: slice.filter(([t]) => t === 'folder').map(([, id]) => id),
          fileIds: slice.filter(([t]) => t === 'file').map(([, id]) => id),
        };
        const res = await apiFetch<{ deletedFolderIds: string[]; deletedFileIds: string[] }>(
          '/api/trash/bulk',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'permanent_delete', ...chunk }),
          },
        );
        const removedFolders = new Set(res.deletedFolderIds);
        const removedFiles = new Set(res.deletedFileIds);
        startTransition(() => {
          setFolders((prev) => prev.filter((f) => !removedFolders.has(f.id)));
          setFiles((prev) => prev.filter((f) => !removedFiles.has(f.id)));
          setSelected((prev) => {
            const next = new Set(prev);
            chunk.folderIds.forEach((id) => next.delete(toKey('folder', id)));
            chunk.fileIds.forEach((id) => next.delete(toKey('file', id)));
            return next;
          });
        });
        onChunkDone?.(chunk.folderIds.length + chunk.fileIds.length);
      }
    },
    [],
  );

  const handleRestoreFolder = useCallback(
    async (id: string) => {
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
    },
    [markBusy, clearBusy, load, router],
  );

  const handlePermanentDeleteFolder = useCallback(
    async (id: string) => {
      if (!canPermanentDelete) return;
      if (
        !(await confirm({
          title: 'Delete folder permanently',
          message: 'Permanently delete this folder? This cannot be undone.',
          confirmLabel: 'Delete permanently',
          destructive: true,
        }))
      )
        return;
      markBusy(id);
      try {
        // Route through the bulk path so the server-reported subtree ids drop
        // optimistically (descendants of a trashed folder also appear in this list).
        await executeOptimisticPermanentDelete([id], []);
        // One deferred refresh for the other server-rendered sections (Files,
        // Dashboard counts, Activity), off the interaction's paint path.
        startTransition(() => router.refresh());
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : 'Could not delete folder.');
        await load(); // resync the list to whatever actually completed
      } finally {
        clearBusy(id);
      }
    },
    [canPermanentDelete, markBusy, clearBusy, load, router, executeOptimisticPermanentDelete, confirm],
  );

  const handleRestoreFile = useCallback(
    async (id: string) => {
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
    },
    [markBusy, clearBusy, load, router],
  );

  const handlePermanentDeleteFile = useCallback(
    async (id: string) => {
      if (!canPermanentDelete) return;
      if (
        !(await confirm({
          title: 'Delete file permanently',
          message:
            'This permanently removes the file from storage and cannot be undone. Delete this file and all its versions?',
          confirmLabel: 'Delete permanently',
          destructive: true,
        }))
      ) {
        return;
      }
      markBusy(id);
      try {
        await executeOptimisticPermanentDelete([], [id]);
        // One deferred refresh for the other server-rendered sections, off the
        // interaction's paint path.
        startTransition(() => router.refresh());
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : 'Could not delete file.');
        await load(); // resync the list to whatever actually completed
      } finally {
        clearBusy(id);
      }
    },
    [canPermanentDelete, markBusy, clearBusy, load, router, executeOptimisticPermanentDelete, confirm],
  );

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
    if (n === 0) return;
    if (
      !(await confirm({
        title: 'Delete permanently',
        message: `This permanently removes ${n} selected item${n === 1 ? '' : 's'} from storage and cannot be undone. Continue?`,
        confirmLabel: 'Delete permanently',
        destructive: true,
      }))
    ) {
      return;
    }

    setBulkBusy(true);
    setProgress({ done: 0, total: n });
    try {
      // Same optimistic core as single-item delete; advance the progress bar as
      // each chunk confirms.
      await executeOptimisticPermanentDelete(folderIds, fileIds, (count) => {
        setProgress((p) => (p ? { ...p, done: p.done + count } : p));
      });
      // One deferred refresh on success, off the interaction's paint path, so the
      // server-rendered sections (Files, Dashboard counts, Activity) stay fresh.
      startTransition(() => router.refresh());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Bulk delete failed.');
      // Resync from the server so the list reflects whatever did complete.
      await load();
    } finally {
      setBulkBusy(false);
      setProgress(null);
    }
  }

  const isEmpty = folders.length === 0 && files.length === 0;
  const selectedCount = selected.size;

  return (
    <div className="mx-auto max-w-5xl">
      {confirmDialog}
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
                  {bulkBusy && progress ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete forever
                </button>
              )}
              {progress && (
                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                  {progress.done}/{progress.total}
                </span>
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
                    {folders.map((f) => (
                      <TrashFolderRow
                        key={f.id}
                        folder={f}
                        selected={selected.has(toKey('folder', f.id))}
                        busy={busyIds.has(f.id)}
                        disabled={busyIds.has(f.id) || bulkBusy}
                        canPermanentDelete={canPermanentDelete}
                        onToggle={toggleSelect}
                        onRestore={handleRestoreFolder}
                        onDelete={handlePermanentDeleteFolder}
                      />
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
                      <th className="w-10 px-4 py-3" />
                      <th className="px-4 py-3">Name</th>
                      <th className="hidden px-4 py-3 sm:table-cell">Type</th>
                      <th className="hidden px-4 py-3 md:table-cell">Size</th>
                      <th className="hidden px-4 py-3 md:table-cell">Deleted</th>
                      <th className="w-36 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f) => (
                      <TrashFileRow
                        key={f.id}
                        file={f}
                        selected={selected.has(toKey('file', f.id))}
                        busy={busyIds.has(f.id)}
                        disabled={busyIds.has(f.id) || bulkBusy}
                        canPermanentDelete={canPermanentDelete}
                        onToggle={toggleSelect}
                        onRestore={handleRestoreFile}
                        onDelete={handlePermanentDeleteFile}
                      />
                    ))}
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
