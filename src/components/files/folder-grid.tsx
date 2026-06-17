'use client';

import { Folder, MoreVertical, Pencil, Trash2, FolderInput, Download } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { FixedMenu } from '@/components/ui/fixed-menu';
import {
  type DndPayload,
  startDrag,
  endDrag,
  getActiveDrag,
  isInternalDrag,
  readDragPayload,
} from '@/lib/dnd';

type FolderItem = {
  id: string;
  name: string;
  _count: { children: number; files: number };
};

type FolderView = 'grid' | 'list';

type FolderHandlers = {
  onOpen: (id: string) => void;
  onRename: (f: FolderItem) => void;
  onDelete: (id: string) => void;
  onMove?: (f: FolderItem) => void;
  onDownload?: (id: string) => void;
  onDropOnFolder?: (item: DndPayload, targetFolderId: string) => void;
};

export const FolderGrid = memo(function FolderGrid({
  folders,
  view = 'grid',
  ...handlers
}: { folders: FolderItem[]; view?: FolderView } & FolderHandlers) {
  return (
    <section className="relative z-0">
      <h2 className="bpp-label-caps mb-3.5">Folders</h2>
      {view === 'list' ? (
        <div className="bpp-card divide-y divide-border/30 overflow-hidden">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} view="list" {...handlers} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {folders.map((folder) => (
            <FolderCard key={folder.id} folder={folder} view="grid" {...handlers} />
          ))}
        </div>
      )}
    </section>
  );
});

// Memoized + binds the parent's stable (id)/(folder) callbacks to its own folder
// internally, so a sibling change or parent re-render doesn't repaint every card.
const FolderCard = memo(function FolderCard({
  folder,
  view,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onDownload,
  onDropOnFolder,
}: { folder: FolderItem; view: FolderView } & FolderHandlers) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Local hover state for the drop affordance — kept here (not in FileBrowser) so
  // a dragover only re-renders the card under the cursor, never the whole grid.
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [dragging, setDragging] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const itemCount = folder._count.children + folder._count.files;
  const isList = view === 'list';

  // True only when this card is a legal target for the in-flight internal drag
  // (an internal item that isn't this very folder).
  function canAccept(e: React.DragEvent): boolean {
    if (!onDropOnFolder || !isInternalDrag(e)) return false;
    const active = getActiveDrag();
    return active === null || active.id !== folder.id; // suppress self-drop
  }

  const base = isList
    ? 'group relative flex cursor-grab items-center gap-3 px-4 py-2.5 transition-all active:cursor-grabbing hover:bg-accent/20'
    : 'bpp-card-interactive group relative flex cursor-grab items-center gap-3 px-4 py-3.5 transition-all active:cursor-grabbing hover:-translate-y-0.5';
  const dropCls = isDropTarget
    ? isList
      ? 'bg-primary/8 ring-1 ring-inset ring-primary'
      : 'scale-[1.02] bg-primary/8 ring-2 ring-primary'
    : '';

  return (
    <div
      className={`${base} ${dropCls} ${dragging ? 'opacity-50' : ''}`}
      draggable
      onDragStart={(e) => {
        startDrag(e, { kind: 'folder', id: folder.id });
        setDragging(true);
      }}
      onDragEnd={() => {
        endDrag();
        setDragging(false);
      }}
      onDragOver={(e) => {
        if (!canAccept(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={(e) => {
        if (canAccept(e)) setIsDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDropTarget(false);
      }}
      onDrop={(e) => {
        if (!canAccept(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        const payload = readDragPayload(e);
        if (payload && payload.id !== folder.id) onDropOnFolder?.(payload, folder.id);
      }}
    >
      <button
        type="button"
        onClick={() => onOpen(folder.id)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 ${
            isList ? 'h-8 w-8' : 'h-10 w-10'
          }`}
        >
          <Folder className={isList ? 'h-4 w-4 text-primary' : 'h-5 w-5 text-primary'} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="pr-2 text-[13px] font-semibold tracking-tight break-words [overflow-wrap:anywhere]"
            title={folder.name}
          >
            {folder.name}
          </p>
          {!isList && (
            <p className="text-[11px] text-muted-foreground/70">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        {isList && (
          <span className="shrink-0 pr-2 text-[11px] tabular-nums text-muted-foreground/55">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      <button
        ref={menuBtnRef}
        type="button"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
        className={`shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground/40 transition-[opacity,color,background-color,transform] hover:bg-accent hover:text-foreground active:scale-90 ${
          isList ? 'opacity-60 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
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
