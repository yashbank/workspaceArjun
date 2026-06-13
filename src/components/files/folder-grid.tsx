'use client';

import { Folder, MoreVertical, Pencil, Trash2, FolderInput, Download } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { FixedMenu } from '@/components/ui/fixed-menu';

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
    <section className="relative z-0">
      <h2 className="bpp-label-caps mb-3.5">Folders</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onOpen={onOpen}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
            onDownload={onDownload}
          />
        ))}
      </div>
    </section>
  );
});

// Memoized + binds the parent's stable (id)/(folder) callbacks to its own folder
// internally, so a sibling change or parent re-render doesn't repaint every card.
const FolderCard = memo(function FolderCard({
  folder,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onDownload,
}: {
  folder: FolderItem;
  onOpen: (id: string) => void;
  onRename: (f: FolderItem) => void;
  onDelete: (id: string) => void;
  onMove?: (f: FolderItem) => void;
  onDownload?: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const itemCount = folder._count.children + folder._count.files;

  return (
    <div className="bpp-card-interactive group relative flex items-center gap-3 px-4 py-3.5 hover:-translate-y-0.5">
      <button type="button" onClick={() => onOpen(folder.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent ring-1 ring-border/40">
          <Folder className="h-5 w-5 text-foreground/70" />
        </div>
        <div className="min-w-0">
          <p className="truncate pr-2 text-[13px] font-semibold tracking-tight">{folder.name}</p>
          <p className="text-[11px] text-muted-foreground/50">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </p>
        </div>
      </button>

      <button
        ref={menuBtnRef}
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
        className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-[opacity,color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-90 group-hover:opacity-100"
        aria-label="Folder actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <FixedMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuBtnRef}
        align="right"
        width={176}
      >
        {onDownload && (
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setMenuOpen(false);
              onDownload(folder.id);
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5 text-muted-foreground/50" /> Download ZIP
          </button>
        )}
        {onMove && (
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => {
              setMenuOpen(false);
              onMove(folder);
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-accent"
          >
            <FolderInput className="h-3.5 w-3.5 text-muted-foreground/50" /> Move to…
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setMenuOpen(false);
            onRename(folder);
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" /> Rename
        </button>
        <div className="my-1 border-t border-border/30" />
        <button
          type="button"
          role="menuitem"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => {
            setMenuOpen(false);
            onDelete(folder.id);
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-destructive transition-colors hover:bg-destructive/8"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </FixedMenu>
    </div>
  );
});
