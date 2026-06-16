'use client';

import { useCallback, useEffect, useState } from 'react';
import { Folder, ChevronRight, Loader2, FolderInput } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type FolderOption = { id: string; name: string; parentId: string | null };

export function MoveDialog({
  itemName,
  onConfirm,
  onClose,
}: {
  itemName: string;
  onConfirm: (targetFolderId: string | null) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [currentParent, setCurrentParent] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Root' }]);

  const loadFolders = useCallback(async (parentId: string | null) => {
    setLoading(true);
    try {
      const qs = parentId ? `?parentId=${parentId}` : '';
      const data = await apiFetch<FolderOption[]>(`/api/folders${qs}`);
      setFolders(data);
    } catch {
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on navigation
    loadFolders(currentParent);
  }, [currentParent, loadFolders]);

  function navigateInto(folder: FolderOption) {
    setCurrentParent(folder.id);
    setSelected(null);
    setPath((p) => [...p, { id: folder.id, name: folder.name }]);
  }

  function navigateToPath(index: number) {
    const target = path[index];
    setCurrentParent(target.id);
    setSelected(null);
    setPath((p) => p.slice(0, index + 1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-card shadow-float animate-in scale-in fade-in duration-200">
        <div className="flex items-center gap-3 border-b border-border/30 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8">
            <FolderInput className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Move &ldquo;{itemName}&rdquo;</h2>
            <p className="text-[11px] text-muted-foreground/60">Select destination folder</p>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-border/20 bg-muted/10 px-5 py-2 text-xs">
          {path.map((p, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/30" />}
              <button
                onClick={() => navigateToPath(i)}
                className={`rounded-lg px-1.5 py-0.5 font-medium transition-all hover:bg-accent ${i === path.length - 1 ? 'text-foreground' : 'text-muted-foreground/60'}`}
              >
                {p.name}
              </button>
            </span>
          ))}
        </div>

        <div className="h-56 overflow-y-auto p-2">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <Folder className="h-5 w-5 text-muted-foreground/20" />
              <p className="text-xs text-muted-foreground/40">No subfolders here</p>
            </div>
          ) : (
            folders.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  selected === f.id ? 'bg-primary/8 shadow-card' : 'hover:bg-accent/30'
                }`}
              >
                <button
                  onClick={() => setSelected(f.id === selected ? null : f.id)}
                  className="flex flex-1 items-center gap-3"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/8">
                    <Folder className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <span className="truncate text-[13px] font-medium" title={f.name}>{f.name}</span>
                </button>
                <button
                  onClick={() => navigateInto(f)}
                  className="rounded-lg p-1.5 text-muted-foreground/40 transition-all hover:bg-accent hover:text-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/30 px-5 py-3">
          <p className="text-[11px] text-muted-foreground/50">
            {selected ? 'Move into selected folder' : 'Move to current location'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selected ?? currentParent)}
              className="rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
