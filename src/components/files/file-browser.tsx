'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { sortFiles } from '@/lib/sort-files';
import { resolveActivePreview } from '@/lib/active-preview';
import { useUpload } from '@/lib/use-upload';
import { uploadVersionDirect, formatUploadError } from '@/lib/direct-upload';
import { withCopySuffix } from '@/lib/upload-filename';
import { useToast } from '@/components/ui/toast';
import { Breadcrumbs } from './breadcrumbs';
import { FolderGrid } from './folder-grid';
import { FileTable } from './file-table';
import { FileGrid } from './file-grid';
import type { FileItem } from './file-table';
import { DropZone } from './drop-zone';
import { UploadQueue } from './upload-queue';
import { SearchBar } from './search-bar';
import type { DuplicateAction } from './duplicate-dialog';
import { parseApiErrorMessage } from '@/lib/storage-errors';
import { FixedMenu } from '@/components/ui/fixed-menu';
import { DialogSkeleton, PreviewPanelSkeleton } from './lazy-fallbacks';

// Heavy, conditionally-rendered UI is code-split so it stays out of the initial
// Files-page bundle and loads only when first opened (C2). ssr:false is safe —
// these only ever render in response to client interaction.
const PreviewPanel = dynamic(() => import('./preview-panel').then((m) => m.PreviewPanel), {
  ssr: false,
  loading: () => <PreviewPanelSkeleton />,
});
const CreateFolderDialog = dynamic(
  () => import('./create-folder-dialog').then((m) => m.CreateFolderDialog),
  { ssr: false, loading: () => <DialogSkeleton /> },
);
const RenameDialog = dynamic(() => import('./rename-dialog').then((m) => m.RenameDialog), {
  ssr: false,
  loading: () => <DialogSkeleton />,
});
const NewVersionDialog = dynamic(
  () => import('./new-version-dialog').then((m) => m.NewVersionDialog),
  { ssr: false, loading: () => <DialogSkeleton /> },
);
const FolderImportDialog = dynamic(
  () => import('./folder-import-dialog').then((m) => m.FolderImportDialog),
  { ssr: false, loading: () => <DialogSkeleton /> },
);
const DuplicateDialog = dynamic(
  () => import('./duplicate-dialog').then((m) => m.DuplicateDialog),
  { ssr: false, loading: () => <DialogSkeleton /> },
);
const MoveDialog = dynamic(() => import('./move-dialog').then((m) => m.MoveDialog), {
  ssr: false,
  loading: () => <DialogSkeleton />,
});
import {
  FolderPlus,
  Upload,
  FolderUp,
  LayoutGrid,
  LayoutList,
  ArrowUpDown,
  Trash2,
  FolderInput,
  Download,
} from 'lucide-react';

type Folder = {
  id: string;
  name: string;
  parentId: string | null;
  _count: { children: number; files: number };
  createdAt: string;
};

type Crumb = { id: string; name: string };

// P3: one entry of the small in-memory stale-while-revalidate folder cache.
type FolderCacheEntry = {
  folders: Folder[];
  files: FileItem[];
  breadcrumbs: Crumb[];
  truncated: boolean;
  ts: number;
};

// Module-scoped so cached folder contents survive FileBrowser unmount/remount
// (e.g. navigating Files → Admin → Files). Revisits render instantly from this
// cache and still trigger a silent background refetch to stay fresh. Client-only
// and per browser session; cleared on full page reload.
const folderCache = new Map<string, FolderCacheEntry>();

type SortOption = { by: string; dir: 'asc' | 'desc'; label: string };

const SORT_OPTIONS: SortOption[] = [
  { by: 'name', dir: 'asc', label: 'Name A–Z' },
  { by: 'name', dir: 'desc', label: 'Name Z–A' },
  { by: 'date', dir: 'desc', label: 'Newest first' },
  { by: 'date', dir: 'asc', label: 'Oldest first' },
  { by: 'size', dir: 'desc', label: 'Largest first' },
  { by: 'size', dir: 'asc', label: 'Smallest first' },
  { by: 'type', dir: 'asc', label: 'Type' },
];

// Mirrors FILES_LIST_LIMIT in src/server/files/index.ts. When the server returns
// a full page, the loaded list may be a truncated top-N for the requested sort,
// so client-side re-sorting could reorder a partial set — in that case we fall
// back to a server refetch instead (see the sort-change effect below).
const FILES_LIST_LIMIT = 500;

// P2: only show the loading skeleton if a (non-silent) load takes longer than
// this, so fast navigations don't flash a skeleton.
const SKELETON_DELAY_MS = 150;

export function FileBrowser({
  canDiagnose = false,
  canPermanentDelete = false,
}: {
  canDiagnose?: boolean;
  canPermanentDelete?: boolean;
}) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Always start with 'list' so server and client render identical HTML.
  // Restore persisted preference after hydration via useEffect below.
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [hydrated, setHydrated] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [, startTransition] = useTransition();

  // Whether the server returned a full (truncated) page for the current folder.
  // When true, sorting must round-trip to the server; otherwise we sort the
  // already-loaded list client-side with no network call.
  const [truncated, setTruncated] = useState(false);
  // Keep the latest sort available to the stable `loadContents` callback without
  // making it a dependency (so changing sort doesn't recreate it / refetch).
  const sortIdxRef = useRef(sortIdx);
  sortIdxRef.current = sortIdx;

  useEffect(() => {
    const saved = localStorage.getItem('arjun-view');
    if (saved === 'grid' || saved === 'list') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe: read localStorage after mount to avoid SSR mismatch
      setViewMode(saved);
    }
    setHydrated(true);
  }, []);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    type: 'folder' | 'file';
    id: string;
    name: string;
  } | null>(null);
  const [versionTarget, setVersionTarget] = useState<{ id: string; name: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [folderImportFiles, setFolderImportFiles] = useState<File[] | null>(null);
  const [moveTarget, setMoveTarget] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null);

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Prevent double-submissions
  const [busyAction, setBusyAction] = useState(false);

  // Duplicate handling — every selected file is checked; conflicts are queued
  // and resolved one at a time via the dialog. `duplicateInfo` is the conflict
  // currently shown; `conflictQueueRef` holds the rest still to resolve.
  const [duplicateInfo, setDuplicateInfo] = useState<{
    file: File;
    existingFileId: string;
    remainingCount: number;
  } | null>(null);
  const conflictQueueRef = useRef<{ file: File; existingFileId: string }[]>([]);

  const fileIds = useMemo(() => files.map((f) => f.id), [files]);

  // Client-side sorted view of the loaded files. When the list is truncated at
  // the server cap, the server already ordered the correct top-N, so we keep
  // its order; otherwise we sort locally with no network round-trip.
  const sortedFiles = useMemo(() => {
    if (truncated) return files;
    const sort = SORT_OPTIONS[sortIdx];
    return sortFiles(files, sort.by, sort.dir);
  }, [files, sortIdx, truncated]);

  // Keep the open preview in sync with refreshed list data: after a version
  // restore/replace changes the file's currentVersionId, re-derive the preview
  // from the latest list so its hero image and filmstrip show the current
  // version. Derived (not stored), so there's no update loop; falls back to the
  // captured object if the file is no longer in the current list.
  const activePreviewFile = useMemo(
    () => resolveActivePreview(previewFile, sortedFiles),
    [previewFile, sortedFiles],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const sortBtnRef = useRef<HTMLButtonElement>(null);

  const { toast } = useToast();

  const fetchIdRef = useRef(0);
  // P3: in-memory stale-while-revalidate cache keyed by folderId ("root" for the
  // top level). Lets revisited folders render instantly while a background
  // revalidation runs. Invalidated on mutations (see the mutation handlers).
  const cacheRef = useRef(folderCache);

  const loadContents = useCallback(
    async (folderId: string | null, opts?: { silent?: boolean }) => {
    const fetchId = ++fetchIdRef.current;
    setError(null);

    const cacheKey = folderId ?? 'root';
    const cached = cacheRef.current.get(cacheKey);

    // P3: on navigation (not a silent post-mutation refetch), if this folder is
    // cached, show it immediately and revalidate in the background.
    const showCached = !opts?.silent && !!cached;
    if (showCached && cached) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setTruncated(cached.truncated);
      setBreadcrumbs(cached.breadcrumbs);
      setLoading(false);
    }

    // P1: silent refetches (after a mutation) keep the current files/folders
    // visible — no skeleton — until fresh data replaces them.
    // P2: for visible loads with nothing to show yet, delay the skeleton so a
    // fast load never flashes it (cached loads never show it at all).
    let skeletonTimer: ReturnType<typeof setTimeout> | undefined;
    if (!opts?.silent && !cached) {
      skeletonTimer = setTimeout(() => {
        if (fetchId === fetchIdRef.current) setLoading(true);
      }, SKELETON_DELAY_MS);
    }

    try {
      const sort = SORT_OPTIONS[sortIdxRef.current];
      const qs = folderId ? `?parentId=${folderId}` : '';
      const fqs = folderId
        ? `?folderId=${folderId}&sortBy=${sort.by}&sortDir=${sort.dir}`
        : `?sortBy=${sort.by}&sortDir=${sort.dir}`;
      // Fetch breadcrumbs in parallel with folders/files instead of waiting for
      // the content to load first. Failures degrade to empty breadcrumbs.
      const crumbReq: Promise<Crumb[]> = folderId
        ? fetch(`/api/folders/breadcrumbs?folderId=${folderId}`)
            .then((res) => (res.ok ? (res.json() as Promise<Crumb[]>) : []))
            .catch(() => [])
        : Promise.resolve([]);

      const [folderData, fileData, crumbData] = await Promise.all([
        apiFetch<Folder[]>(`/api/folders${qs}`),
        apiFetch<FileItem[]>(`/api/files${fqs}`),
        crumbReq,
      ]);

      // Discard stale responses from superseded fetches
      if (fetchId !== fetchIdRef.current) return;

      // Dedupe by id as a safety net against duplicate data
      const seenFolders = new Set<string>();
      const uniqueFolders = folderData.filter((f) => {
        if (seenFolders.has(f.id)) return false;
        seenFolders.add(f.id);
        return true;
      });
      const seenFiles = new Set<string>();
      const uniqueFiles = fileData.filter((f) => {
        if (seenFiles.has(f.id)) return false;
        seenFiles.add(f.id);
        return true;
      });

      const isTruncated = uniqueFiles.length >= FILES_LIST_LIMIT;
      setFolders(uniqueFolders);
      setFiles(uniqueFiles);
      setTruncated(isTruncated);
      setBreadcrumbs(crumbData);
      cacheRef.current.set(cacheKey, {
        folders: uniqueFolders,
        files: uniqueFiles,
        breadcrumbs: crumbData,
        truncated: isTruncated,
        ts: Date.now(),
      });
    } catch (e: unknown) {
      if (fetchId !== fetchIdRef.current) return;
      // If cached content is already on screen, keep it on a revalidation
      // failure; only surface an error when there was nothing to show.
      if (!showCached) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    } finally {
      if (skeletonTimer) clearTimeout(skeletonTimer);
      if (fetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on navigation
    void loadContents(currentFolderId);
  }, [currentFolderId, loadContents]);

  // Changing the sort re-sorts the loaded list client-side for free (see the
  // `sortedFiles` memo). Only refetch when the list was truncated at the server
  // cap, where the loaded rows are a partial top-N that can't be reordered locally.
  const sortInitRef = useRef(false);
  useEffect(() => {
    if (!sortInitRef.current) {
      sortInitRef.current = true;
      return;
    }
    if (truncated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch only when list is server-truncated
      void loadContents(currentFolderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when sort changes
  }, [sortIdx]);

  // Load favorites
  useEffect(() => {
    apiFetch<Array<{ targetType: string; targetId: string }>>('/api/favorites')
      .then((favs) => {
        const ids = new Set(favs.filter((f) => f.targetType === 'file').map((f) => f.targetId));
        setFavorites(ids);
      })
      .catch(() => {});
  }, []);

  // Keyboard shortcuts for file browser
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCmd = e.metaKey || e.ctrlKey;

      if (e.key === 'u' && !isCmd) {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (e.key === 'n' && !isCmd) {
        e.preventDefault();
        setShowCreateFolder(true);
        return;
      }
      if (e.key === 'v' && !isCmd) {
        e.preventDefault();
        setViewMode((m) => {
          const next = m === 'list' ? 'grid' : 'list';
          localStorage.setItem('arjun-view', next);
          return next;
        });
        return;
      }
      if (e.key === 'a' && isCmd && files.length > 0) {
        e.preventDefault();
        setSelectedIds(new Set(files.map((f) => f.id)));
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0 && !isCmd) {
        e.preventDefault();
        handleBulkDelete();
        return;
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, selectedIds]);

  // Paste handling
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) pastedFiles.push(f);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        handleFilesSelected(pastedFiles);
      }
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId]);

  const { queue, startUpload, retry, cancel, dismiss } = useUpload(currentFolderId, () =>
    loadContents(currentFolderId, { silent: true }),
  );

  async function handleFilesSelected(selectedFiles: File[]) {
    if (selectedFiles.length === 0) return;

    // Check EVERY selected file for a same-name conflict in the current folder
    // (duplicate detection is scoped to the folder, so the same name in a
    // different folder is allowed). Non-conflicting files upload right away;
    // conflicts are queued for the resolution dialog.
    const qs = currentFolderId ? `&folderId=${currentFolderId}` : '';
    const conflicts: { file: File; existingFileId: string }[] = [];
    const clear: File[] = [];

    for (const file of selectedFiles) {
      try {
        const check = await apiFetch<{ exists: boolean; existingFileId?: string }>(
          `/api/files/check-duplicate?name=${encodeURIComponent(file.name)}${qs}`,
        );
        if (check.exists && check.existingFileId) {
          conflicts.push({ file, existingFileId: check.existingFileId });
          continue;
        }
      } catch {
        // If the check fails, fall through and upload normally.
      }
      clear.push(file);
    }

    if (clear.length > 0) {
      toast('info', `Uploading ${clear.length} file${clear.length > 1 ? 's' : ''}…`);
      startUpload(clear);
    }

    conflictQueueRef.current = conflicts;
    showNextConflict();
  }

  function showNextConflict() {
    const next = conflictQueueRef.current[0];
    if (!next) {
      setDuplicateInfo(null);
      return;
    }
    setDuplicateInfo({
      file: next.file,
      existingFileId: next.existingFileId,
      remainingCount: conflictQueueRef.current.length - 1,
    });
  }

  function handleDuplicateAction(action: DuplicateAction) {
    const current = conflictQueueRef.current.shift();
    setDuplicateInfo(null);
    // Show the next conflict immediately; resolve this one in the background.
    showNextConflict();
    if (current) {
      void resolveConflict(current.file, current.existingFileId, action);
    }
  }

  async function resolveConflict(file: File, existingFileId: string, action: DuplicateAction) {
    if (action === 'cancel') return;

    if (action === 'keep-both') {
      const renamedFile = new File([file], withCopySuffix(file.name), { type: file.type });
      startUpload([renamedFile]);
      return;
    }

    // 'new-version' and 'overwrite' (Replace) both upload the new content as the
    // current version of the EXISTING file: one visible row, never a duplicate.
    // If the upload fails or is aborted, the existing file keeps its current
    // version untouched (the new version is only made current after it lands).
    const replacing = action === 'overwrite';
    try {
      toast('info', `${replacing ? 'Replacing' : 'Updating'} "${file.name}"…`);
      await uploadVersionDirect(file, existingFileId, undefined, () => {});
      toast(
        'success',
        replacing ? `Replaced "${file.name}"` : `New version of "${file.name}" added`,
      );
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      const msg = formatUploadError(e);
      if (msg !== 'Upload cancelled') {
        toast('error', `Could not update "${file.name}": ${msg}`);
      }
    }
  }

  function handleFilesDropped(droppedFiles: File[]) {
    const hasRelativePath = droppedFiles.some(
      (f) => 'relativePath' in f && typeof (f as File & { relativePath?: string }).relativePath === 'string',
    );
    if (hasRelativePath) {
      setFolderImportFiles(droppedFiles);
    } else {
      handleFilesSelected(droppedFiles);
    }
  }

  function navigateTo(folderId: string | null) {
    setCurrentFolderId(folderId);
    setPreviewFile(null);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleFavorite(fileId: string) {
    const isFav = favorites.has(fileId);
    try {
      if (isFav) {
        await apiFetch('/api/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType: 'file', targetId: fileId }),
        });
        setFavorites((prev) => { const n = new Set(prev); n.delete(fileId); return n; });
      } else {
        await apiFetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetType: 'file', targetId: fileId }),
        });
        setFavorites((prev) => new Set(prev).add(fileId));
      }
    } catch { /* ignore */ }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || busyAction) return;
    if (!confirm(`Move ${selectedIds.size} file(s) to trash?`)) return;
    setBusyAction(true);
    const count = selectedIds.size;
    for (const id of selectedIds) {
      try {
        await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
      } catch { /* continue */ }
    }
    if (previewFile && selectedIds.has(previewFile.id)) setPreviewFile(null);
    setSelectedIds(new Set());
    toast('success', `${count} file${count > 1 ? 's' : ''} moved to trash`);
    await loadContents(currentFolderId, { silent: true });
    setBusyAction(false);
  }

  async function handleDeleteFolder(id: string) {
    if (busyAction) return;
    if (!confirm('Move this folder to trash?')) return;
    setBusyAction(true);
    try {
      await apiFetch(`/api/folders/${id}`, { method: 'DELETE' });
      toast('success', 'Folder moved to trash');
      // A trashed folder + its subtree are no longer reachable; clear the cache.
      cacheRef.current.clear();
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not delete folder');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDeleteFile(id: string) {
    if (busyAction) return;
    if (!confirm('Move this file to trash?')) return;
    setBusyAction(true);
    try {
      await apiFetch(`/api/files/${id}`, { method: 'DELETE' });
      if (previewFile?.id === id) setPreviewFile(null);
      toast('success', 'File moved to trash');
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not delete file');
    } finally {
      setBusyAction(false);
    }
  }

  async function handlePermanentDeleteFile(id: string) {
    if (busyAction) return;
    if (!confirm('Delete this file permanently? This cannot be undone.')) return;
    setBusyAction(true);
    try {
      await apiFetch(`/api/files/${id}?permanent=true`, { method: 'DELETE' });
      if (previewFile?.id === id) setPreviewFile(null);
      toast('success', 'File deleted permanently');
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Could not delete file');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleRenameConfirm(newName: string) {
    if (!renameTarget || busyAction) return;
    setBusyAction(true);
    const endpoint =
      renameTarget.type === 'folder'
        ? `/api/folders/${renameTarget.id}`
        : `/api/files/${renameTarget.id}`;
    try {
      await apiFetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const renamedFolder = renameTarget.type === 'folder';
      setRenameTarget(null);
      toast('success', `Renamed to "${newName}"`);
      // A renamed folder changes its breadcrumb label across its subtree.
      if (renamedFolder) cacheRef.current.clear();
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Rename failed');
    } finally {
      setBusyAction(false);
    }
  }

  async function handleDownloadFile(id: string) {
    try {
      const res = await fetch(`/api/files/${id}/download`);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        toast('error', parseApiErrorMessage(payload, 'Download failed'));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?(.+?)"?$/);
      const filename = match?.[1] ? decodeURIComponent(match[1]) : 'download';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast('error', 'Download failed — check your connection');
    }
  }

  async function handleMoveConfirm(targetFolderId: string | null) {
    if (!moveTarget || busyAction) return;
    setBusyAction(true);
    try {
      if (moveTarget.type === 'file') {
        await apiFetch(`/api/files/${moveTarget.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
      } else {
        await apiFetch(`/api/folders/${moveTarget.id}/move`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: targetFolderId }),
        });
      }
      toast('success', `${moveTarget.type === 'file' ? 'File' : 'Folder'} moved`);
      // The source folder (current) is revalidated below; invalidate the
      // destination too. A folder move shifts subtrees/breadcrumbs broadly, so
      // clear the whole cache to stay safe.
      if (moveTarget.type === 'file') {
        cacheRef.current.delete(targetFolderId ?? 'root');
      } else {
        cacheRef.current.clear();
      }
      setMoveTarget(null);
      await loadContents(currentFolderId, { silent: true });
    } catch (e: unknown) {
      toast('error', e instanceof Error ? e.message : 'Move failed');
    } finally {
      setBusyAction(false);
    }
  }

  function handleDownloadFolder(folderId: string) {
    toast('info', 'Preparing ZIP download…');
    window.open(`/api/folders/${folderId}/download`, '_blank');
  }

  // "Move to folder" is possible whenever any folder exists to move into: either
  // we're inside a folder, or the current (root) level already shows folders.
  const canMoveFiles = currentFolderId !== null || folders.length > 0;

  return (
    <DropZone onFilesDropped={handleFilesDropped}>
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-0">
        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="bpp-page-title">Files</h1>
                <Breadcrumbs crumbs={breadcrumbs} onNavigate={navigateTo} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchBar
                  onNavigateToFolder={navigateTo}
                  onPreviewFile={(fileId) => {
                    const found = files.find((f) => f.id === fileId);
                    if (found) setPreviewFile(found);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-[box-shadow,transform] hover:shadow-elevated active:scale-[0.97]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </div>
            </div>

            {/* Toolbar row — relative z-20 so portaled menus stack above folder grid */}
            <div className="relative z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-border/50 bg-card/80 p-2 shadow-card backdrop-blur-sm">
              <button
                onClick={() => setShowCreateFolder(true)}
                className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs font-medium shadow-card transition-[box-shadow,transform] hover:shadow-elevated active:scale-[0.97]"
              >
                <FolderPlus className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="hidden sm:inline">New folder</span>
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs font-medium shadow-card transition-[box-shadow,transform] hover:shadow-elevated active:scale-[0.97]"
                title="Import folder"
              >
                <FolderUp className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="hidden sm:inline">Import</span>
              </button>

              <div className="mx-1 h-4 w-px bg-border/30" />

              {/* Sort */}
              <button
                ref={sortBtnRef}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowSortMenu((v) => !v);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 py-2 text-xs font-medium shadow-card transition-shadow hover:shadow-elevated"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="hidden sm:inline">{SORT_OPTIONS[sortIdx].label}</span>
              </button>
              <FixedMenu
                open={showSortMenu}
                onClose={() => setShowSortMenu(false)}
                anchorRef={sortBtnRef}
                align="right"
                width={176}
                estimatedHeight={SORT_OPTIONS.length * 36 + 12}
              >
                {SORT_OPTIONS.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      startTransition(() => setSortIdx(i));
                      setShowSortMenu(false);
                    }}
                    className={`flex w-full cursor-pointer rounded-lg px-3 py-2 text-xs transition-colors ${i === sortIdx ? 'bg-accent font-medium' : 'hover:bg-accent/50'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </FixedMenu>

              {/* View toggle */}
              <div className="flex items-center overflow-hidden rounded-xl border border-border/50 bg-card shadow-card">
                <button
                  onClick={() => { setViewMode('list'); localStorage.setItem('arjun-view', 'list'); }}
                  className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="List view (V)"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { setViewMode('grid'); localStorage.setItem('arjun-view', 'grid'); }}
                  className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Grid view (V)"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          {files.length > 0 && (
            <div className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-2.5 transition-[border-color,background-color,box-shadow] ${selectedIds.size > 0 ? 'border-primary/20 bg-primary/4 shadow-card' : 'border-border/40 bg-card/40'}`}>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.size === files.length && files.length > 0}
                  ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < files.length; }}
                  onChange={() => {
                    if (selectedIds.size === files.length) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(fileIds));
                    }
                  }}
                  className="h-4 w-4 rounded border-muted-foreground/40 accent-primary"
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {selectedIds.size === 0
                    ? `Select all (${files.length})`
                    : `${selectedIds.size} of ${files.length} selected`}
                </span>
              </label>
              {selectedIds.size > 0 && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <button
                    onClick={() => {
                      const firstId = Array.from(selectedIds)[0];
                      const firstFile = files.find((f) => f.id === firstId);
                      if (firstFile) setMoveTarget({ id: firstId, name: firstFile.name, type: 'file' });
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.97]"
                  >
                    <FolderInput className="h-3.5 w-3.5" />
                    Move
                  </button>
                  <button
                    onClick={async () => {
                      for (const id of selectedIds) {
                        await handleDownloadFile(id);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.97]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={busyAction}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive transition-[opacity,background-color,transform] hover:bg-destructive/10 disabled:opacity-50 active:scale-[0.97]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {busyAction ? 'Deleting…' : 'Delete'}
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-[0.97]"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          )}

          {/* Hidden inputs */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              if (f.length) handleFilesSelected(f);
              e.target.value = '';
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error -- webkitdirectory is non-standard
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={(e) => {
              const f = Array.from(e.target.files ?? []);
              if (f.length) setFolderImportFiles(f);
              e.target.value = '';
            }}
          />

          {error && (
            <p className="mb-4 rounded-2xl border border-destructive/15 bg-destructive/4 px-4 py-3 text-sm text-destructive">{error}</p>
          )}

          <div className="relative z-0 space-y-8 pt-2">
          {loading ? (
            <LoadingSkeleton mode={hydrated ? viewMode : 'list'} />
          ) : (
            <>
              {folders.length > 0 && (
                <FolderGrid
                  folders={folders}
                  onOpen={navigateTo}
                  onRename={(f) => setRenameTarget({ type: 'folder', id: f.id, name: f.name })}
                  onDelete={handleDeleteFolder}
                  onMove={(f) => setMoveTarget({ id: f.id, name: f.name, type: 'folder' })}
                  onDownload={handleDownloadFolder}
                />
              )}

              <div key={viewMode} className="animate-in fade-in duration-200">
                {viewMode === 'list' ? (
                  <FileTable
                    files={sortedFiles}
                    onRename={(f) => setRenameTarget({ type: 'file', id: f.id, name: f.name })}
                    onDelete={handleDeleteFile}
                    onDownload={handleDownloadFile}
                    onNewVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
                    onPreview={(f) => setPreviewFile(f)}
                    onMove={(f) => setMoveTarget({ id: f.id, name: f.name, type: 'file' })}
                    onFavorite={toggleFavorite}
                    favorites={favorites}
                    canMove={canMoveFiles}
                    canPermanentDelete={canPermanentDelete}
                    onPermanentDelete={handlePermanentDeleteFile}
                    onVersionRestored={() => loadContents(currentFolderId, { silent: true })}
                  />
                ) : (
                  <FileGrid
                    files={sortedFiles}
                    onPreview={(f) => setPreviewFile(f)}
                    onDownload={handleDownloadFile}
                    onRename={(f) => setRenameTarget({ type: 'file', id: f.id, name: f.name })}
                    onDelete={handleDeleteFile}
                    onNewVersion={(f) => setVersionTarget({ id: f.id, name: f.name })}
                    onMove={(f) => setMoveTarget({ id: f.id, name: f.name, type: 'file' })}
                    onFavorite={toggleFavorite}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    favorites={favorites}
                    canMove={canMoveFiles}
                    canPermanentDelete={canPermanentDelete}
                    onPermanentDelete={handlePermanentDeleteFile}
                  />
                )}
              </div>

              {folders.length === 0 && files.length === 0 && (
                <EmptyState isRoot={currentFolderId === null} />
              )}
            </>
          )}
          </div>
        </div>

        {/* Preview panel */}
        {previewFile && (
          <button
            type="button"
            aria-label="Close preview"
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden"
            onClick={() => setPreviewFile(null)}
          />
        )}
        {activePreviewFile && (
          <PreviewPanel
            file={activePreviewFile}
            files={sortedFiles}
            canDiagnose={canDiagnose}
            onClose={() => setPreviewFile(null)}
            onNavigate={setPreviewFile}
            onDownload={() => handleDownloadFile(activePreviewFile.id)}
            onNewVersion={() => { setPreviewFile(null); setVersionTarget({ id: activePreviewFile.id, name: activePreviewFile.name }); }}
            onFavorite={() => toggleFavorite(activePreviewFile.id)}
            isFavorited={favorites.has(activePreviewFile.id)}
          />
        )}
      </div>

      {/* Upload queue */}
      <UploadQueue items={queue} onRetry={retry} onCancel={cancel} onDismiss={dismiss} />

      {/* Dialogs */}
      {showCreateFolder && (
        <CreateFolderDialog
          parentId={currentFolderId}
          onCreated={() => { setShowCreateFolder(false); loadContents(currentFolderId, { silent: true }); }}
          onClose={() => setShowCreateFolder(false)}
        />
      )}
      {renameTarget && (
        <RenameDialog
          currentName={renameTarget.name}
          itemType={renameTarget.type}
          onConfirm={handleRenameConfirm}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {versionTarget && (
        <NewVersionDialog
          fileId={versionTarget.id}
          fileName={versionTarget.name}
          onUploaded={() => { setVersionTarget(null); loadContents(currentFolderId, { silent: true }); }}
          onClose={() => setVersionTarget(null)}
        />
      )}
      {folderImportFiles && (
        <FolderImportDialog
          files={folderImportFiles}
          parentFolderId={currentFolderId}
          onComplete={() => { setFolderImportFiles(null); cacheRef.current.clear(); loadContents(currentFolderId, { silent: true }); }}
          onCancel={() => setFolderImportFiles(null)}
        />
      )}
      {duplicateInfo && (
        <DuplicateDialog
          fileName={duplicateInfo.file.name}
          existingFileId={duplicateInfo.existingFileId}
          remainingCount={duplicateInfo.remainingCount}
          onAction={handleDuplicateAction}
        />
      )}
      {moveTarget && (
        <MoveDialog
          itemName={moveTarget.name}
          onConfirm={handleMoveConfirm}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </DropZone>
  );
}

const SHIMMER = 'bg-shimmer bg-[length:200%_100%] animate-shimmer';

// Skeleton that mirrors the real layout (Folders section above a Files
// section) so content does not jump when the data loads.
function LoadingSkeleton({ mode }: { mode: 'list' | 'grid' }) {
  return (
    <div className="space-y-8">
      {/* Folders section — matches FolderGrid's label + card grid */}
      <section>
        <div className={`mb-3.5 h-2.5 w-16 rounded ${SHIMMER}`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bpp-card flex items-center gap-3 px-4 py-3.5">
              <div
                className={`h-10 w-10 shrink-0 rounded-xl ${SHIMMER}`}
                style={{ animationDelay: `${i * 60}ms` }}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div
                  className={`h-3.5 w-3/5 rounded-lg ${SHIMMER}`}
                  style={{ animationDelay: `${i * 60 + 40}ms` }}
                />
                <div
                  className={`h-2.5 w-1/4 rounded-md ${SHIMMER}`}
                  style={{ animationDelay: `${i * 60 + 70}ms` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Files section — matches FileTable / FileGrid's label + content */}
      <section>
        <div className={`mb-3.5 h-2.5 w-12 rounded ${SHIMMER}`} />
        {mode === 'grid' ? <GridSkeleton /> : <ListSkeleton />}
      </section>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/50 shadow-card"
        >
          <div className={`aspect-[4/3] ${SHIMMER}`} style={{ animationDelay: `${i * 60}ms` }} />
          <div className="space-y-2.5 p-3.5">
            <div
              className={`h-3.5 w-4/5 rounded-lg ${SHIMMER}`}
              style={{ animationDelay: `${i * 60 + 30}ms` }}
            />
            <div className="flex gap-2">
              <div className={`h-4 w-10 rounded-md ${SHIMMER}`} style={{ animationDelay: `${i * 60 + 50}ms` }} />
              <div className={`h-4 flex-1 rounded-md ${SHIMMER}`} style={{ animationDelay: `${i * 60 + 70}ms` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Mirrors the FileTable column layout (chevron · thumb+name · type · size ·
// uploaded · ver · menu) with the same responsive column hiding, so the real
// table replaces it without a structural shift.
function ListSkeleton() {
  return (
    <div className="bpp-card overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 border-b border-border/30 px-2 py-2.5 last:border-0 sm:gap-4 sm:px-4"
        >
          <div className={`h-5 w-5 shrink-0 rounded ${SHIMMER}`} style={{ animationDelay: `${i * 70}ms` }} />
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className={`h-9 w-9 shrink-0 rounded-lg ${SHIMMER}`} style={{ animationDelay: `${i * 70}ms` }} />
            <div
              className={`h-3.5 rounded-full ${SHIMMER}`}
              style={{ width: `${40 + ((i * 9) % 45)}%`, animationDelay: `${i * 70 + 20}ms` }}
            />
          </div>
          <div className={`hidden h-4 w-12 shrink-0 rounded-md sm:block ${SHIMMER}`} style={{ animationDelay: `${i * 70 + 30}ms` }} />
          <div className={`h-3 w-12 shrink-0 rounded-full ${SHIMMER}`} style={{ animationDelay: `${i * 70 + 40}ms` }} />
          <div className={`hidden h-3 w-20 shrink-0 rounded-full md:block ${SHIMMER}`} style={{ animationDelay: `${i * 70 + 50}ms` }} />
          <div className={`hidden h-3 w-8 shrink-0 rounded-full sm:block ${SHIMMER}`} style={{ animationDelay: `${i * 70 + 60}ms` }} />
          <div className={`h-5 w-5 shrink-0 rounded ${SHIMMER}`} style={{ animationDelay: `${i * 70 + 70}ms` }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ isRoot }: { isRoot: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/40 py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/8 to-primary/4">
        <Upload className="h-7 w-7 text-primary/40" />
      </div>
      <h3 className="mt-5 text-[15px] font-bold tracking-tight">
        {isRoot ? 'Your workspace is empty' : 'This folder is empty'}
      </h3>
      <p className="mt-2 max-w-xs text-center text-[13px] leading-relaxed text-muted-foreground/50">
        {isRoot
          ? 'Upload files or create a folder to get started.'
          : 'Drag files here, paste from the clipboard, or use the Upload button.'}
      </p>
      {isRoot && (
        <div className="mt-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
          <span>PDF</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/15" />
          <span>CDR</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/15" />
          <span>Images</span>
          <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/15" />
          <span>All types</span>
        </div>
      )}
    </div>
  );
}
