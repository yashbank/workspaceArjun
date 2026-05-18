'use client';

import { Folder, MoreVertical, Pencil, Trash2, FolderInput, Download } from 'lucide-react';
import { memo, useRef, useState } from 'react';

type FolderItem = {
  id: string;
  name: string;
  _count: { children: number; files: number };
};

export const FolderGrid = memo(function FolderGrid({
  folders,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onDownload,
}: {
  folders: FolderItem[];
  onOpen: (id: string) => void;
  onRename: (f: FolderItem) => void;
  onDelete: (id: string) => void;
  onMove?: (f: FolderItem) => void;
  onDownload?: (id: string) => void;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        Folders
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onOpen={() => onOpen(folder.id)}
            onRename={() => onRename(folder)}
            onDelete={() => onDelete(folder.id)}
            onMove={onMove ? () => onMove(folder) : undefined}
            onDownload={onDownload ? () => onDownload(folder.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
});

function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onDownload,
}: {
  folder: FolderItem;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMove?: () => void;
  onDownload?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const itemCount = folder._count.children + folder._count.files;

  function openMenu() {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const menuW = 176;
      const menuH = 180;
      let x = rect.right - menuW;
      let y = rect.bottom + 4;
      if (x < 8) x = 8;
      if (y + menuH > window.innerHeight) y = rect.top - menuH - 4;
      setMenuPos({ x, y });
    }
    setMenuOpen(true);
  }

  return (
    <div className="group relative flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-4 py-3.5 shadow-card transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5 hover:border-border">
      <button onClick={onOpen} className="flex flex-1 items-center gap-3 text-left">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-blue-800/20">
          <Folder className="h-5 w-5 text-blue-500 drop-shadow-sm" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold tracking-tight">{folder.name}</p>
          <p className="text-[11px] text-muted-foreground/50">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </p>
        </div>
      </button>

      <button
        ref={menuBtnRef}
        onClick={openMenu}
        className="rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-accent hover:text-foreground active:scale-90 group-hover:opacity-100"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
          <div
            className="fixed z-[70] w-44 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            {onDownload && (
              <button
                onClick={() => { setMenuOpen(false); onDownload(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all hover:bg-accent active:scale-[0.98]"
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground/50" /> Download ZIP
              </button>
            )}
            {onMove && (
              <button
                onClick={() => { setMenuOpen(false); onMove(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all hover:bg-accent active:scale-[0.98]"
              >
                <FolderInput className="h-3.5 w-3.5 text-muted-foreground/50" /> Move to…
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); onRename(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all hover:bg-accent active:scale-[0.98]"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" /> Rename
            </button>
            <div className="my-1 border-t border-border/30" />
            <button
              onClick={() => { setMenuOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-destructive transition-all hover:bg-destructive/8 active:scale-[0.98]"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
