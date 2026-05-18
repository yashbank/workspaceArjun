'use client';

import { FileText, ImageIcon, FileArchive, FileIcon, MoreVertical, Star, Pen } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { getExtension, getFileTypeBadge, formatBytes } from '@/lib/file-utils';
import type { FileItem } from './file-table';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'bmp']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt']);
const DESIGN_EXTS = new Set(['cdr', 'ai', 'eps', 'psd']);

function getCardColor(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return 'from-sky-50 to-sky-100/60 dark:from-sky-950/30 dark:to-sky-900/20 text-sky-600 dark:text-sky-400';
  if (ext === 'pdf') return 'from-red-50 to-red-100/60 dark:from-red-950/30 dark:to-red-900/20 text-red-600 dark:text-red-400';
  if (DESIGN_EXTS.has(ext)) return 'from-purple-50 to-purple-100/60 dark:from-purple-950/30 dark:to-purple-900/20 text-purple-600 dark:text-purple-400';
  if (ARCHIVE_EXTS.has(ext)) return 'from-amber-50 to-amber-100/60 dark:from-amber-950/30 dark:to-amber-900/20 text-amber-600 dark:text-amber-400';
  if (DOC_EXTS.has(ext)) return 'from-blue-50 to-blue-100/60 dark:from-blue-950/30 dark:to-blue-900/20 text-blue-600 dark:text-blue-400';
  return 'from-muted/40 to-muted/60 text-muted-foreground';
}

function FileCardIcon({ ext }: { ext: string }) {
  const cls = 'h-8 w-8 drop-shadow-sm';
  if (IMAGE_EXTS.has(ext)) return <ImageIcon className={cls} />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive className={cls} />;
  if (DESIGN_EXTS.has(ext)) return <Pen className={cls} />;
  if (DOC_EXTS.has(ext)) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

export const FileGrid = memo(function FileGrid({
  files,
  onPreview,
  onContextMenu,
  selectedIds,
  onToggleSelect,
  favorites,
}: {
  files: FileItem[];
  onPreview: (f: FileItem) => void;
  onContextMenu: (f: FileItem, pos: { x: number; y: number }) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  favorites: Set<string>;
}) {
  if (files.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">Files</h2>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            selected={selectedIds.has(file.id)}
            favorited={favorites.has(file.id)}
            onSelect={() => onToggleSelect(file.id)}
            onOpen={() => onPreview(file)}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
});

const FileCard = memo(function FileCard({
  file,
  selected,
  favorited,
  onSelect,
  onOpen,
  onContextMenu,
}: {
  file: FileItem;
  selected: boolean;
  favorited: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu: (f: FileItem, pos: { x: number; y: number }) => void;
}) {
  const ext = getExtension(file.name);
  const badge = getFileTypeBadge(file.name);
  const size = file.currentVersion ? Number(file.currentVersion.sizeBytes) : 0;
  const cardColor = getCardColor(ext);
  const isImage = IMAGE_EXTS.has(ext);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  function handleContext(e: React.MouseEvent) {
    e.preventDefault();
    onContextMenu(file, { x: e.clientX, y: e.clientY });
  }

  function handleMenuClick() {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      onContextMenu(file, { x: rect.left, y: rect.bottom + 4 });
    }
  }

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-all duration-250 ease-out will-change-transform hover:shadow-elevated hover:-translate-y-1 ${
        selected
          ? 'border-primary/40 ring-2 ring-primary/15 shadow-elevated'
          : 'border-border/60 hover:border-border'
      }`}
      onContextMenu={handleContext}
      onDoubleClick={onOpen}
    >
      {/* Thumbnail area — taller aspect ratio for cinematic feel */}
      <div className={`relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br ${cardColor} overflow-hidden`}>
        {isImage && !thumbError ? (
          <>
            {!thumbLoaded && (
              <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${file.id}/preview`}
              alt=""
              className={`h-full w-full object-cover transition-all duration-500 ease-out ${thumbLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
              loading="lazy"
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
            />
            {/* Subtle vignette for depth */}
            {thumbLoaded && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/8 via-transparent to-transparent" />
            )}
          </>
        ) : (
          <FileCardIcon ext={ext} />
        )}

        {/* Selection checkbox — glass pill */}
        <label className={`absolute left-2.5 top-2.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border backdrop-blur-sm transition-all ${selected ? 'border-primary bg-primary' : 'border-white/50 bg-white/30 opacity-0 group-hover:opacity-100 dark:border-white/20 dark:bg-black/30'}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            className="sr-only"
          />
          {selected && (
            <svg viewBox="0 0 16 16" className="h-3 w-3 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 8.5 7 11.5 12 5" />
            </svg>
          )}
        </label>

        {/* Favorite star */}
        {favorited && (
          <div className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 backdrop-blur-md">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400 drop-shadow-sm" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col justify-between gap-1 px-3.5 py-3">
        <p className="truncate text-[13px] font-semibold leading-tight tracking-tight" title={file.name}>{file.name}</p>
        <div className="flex items-center justify-between">
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.color}`}>
            {badge.label}
          </span>
          <span className="text-[10px] tabular-nums text-muted-foreground/50">{formatBytes(size)}</span>
        </div>
      </div>

      {/* Menu button */}
      <button
        ref={menuBtnRef}
        onClick={handleMenuClick}
        className="absolute right-2 bottom-2 rounded-lg p-1 text-muted-foreground/60 opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});
