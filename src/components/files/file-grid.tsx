'use client';

import {
  FileText,
  ImageIcon,
  FileArchive,
  FileIcon,
  MoreVertical,
  Star,
  Pen,
  Film,
  Smartphone,
} from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { getExtension, getFileTypeBadge, formatBytes } from '@/lib/file-utils';
import { FileMediaThumbnail } from './file-media-thumbnail';
import { PremiumFileFallback } from './premium-file-fallback';
import { FileActionMenu } from './file-action-menu';
import type { FileItem } from './file-table';
import { startDrag, endDrag } from '@/lib/dnd';

const PREVIEW_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff']);
const IMAGE_FALLBACK_EXTS = new Set(['heic', 'heif']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt']);
const DESIGN_EXTS = new Set(['cdr', 'ai', 'eps', 'psd']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);
const MEDIA_THUMB_EXTS = new Set([...PREVIEW_IMAGE_EXTS, 'mp4', 'webm', 'm4v']);
const PREMIUM_CARD_EXTS = new Set(['cdr', 'mov', 'pdf', 'xls', 'xlsx', 'csv', 'heic', 'heif']);

function getCardColor(ext: string): string {
  if (PREVIEW_IMAGE_EXTS.has(ext) || IMAGE_FALLBACK_EXTS.has(ext))
    return 'from-sky-50 to-sky-100/60 dark:from-sky-950/30 dark:to-sky-900/20 text-sky-600 dark:text-sky-400';
  if (ext === 'pdf') return 'from-red-50 to-red-100/60 dark:from-red-950/30 dark:to-red-900/20 text-red-600 dark:text-red-400';
  if (VIDEO_EXTS.has(ext))
    return 'from-pink-50 to-pink-100/60 dark:from-pink-950/30 dark:to-pink-900/20 text-pink-600 dark:text-pink-400';
  if (DESIGN_EXTS.has(ext))
    return 'from-purple-50 to-purple-100/60 dark:from-purple-950/30 dark:to-purple-900/20 text-purple-600 dark:text-purple-400';
  if (ARCHIVE_EXTS.has(ext))
    return 'from-amber-50 to-amber-100/60 dark:from-amber-950/30 dark:to-amber-900/20 text-amber-600 dark:text-amber-400';
  if (DOC_EXTS.has(ext))
    return 'from-blue-50 to-blue-100/60 dark:from-blue-950/30 dark:to-blue-900/20 text-blue-600 dark:text-blue-400';
  return 'from-muted/40 to-muted/60 text-muted-foreground';
}

function FileCardIcon({ ext }: { ext: string }) {
  const cls = 'h-8 w-8 drop-shadow-sm';
  if (IMAGE_FALLBACK_EXTS.has(ext)) return <Smartphone className={cls} />;
  if (PREVIEW_IMAGE_EXTS.has(ext)) return <ImageIcon className={cls} />;
  if (VIDEO_EXTS.has(ext)) return <Film className={cls} />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive className={cls} />;
  if (DESIGN_EXTS.has(ext)) return <Pen className={cls} />;
  if (DOC_EXTS.has(ext)) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

export const FileGrid = memo(function FileGrid({
  files,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onNewVersion,
  onMove,
  onFavorite,
  selectedIds,
  onToggleSelect,
  favorites,
  canMove = true,
  canPermanentDelete = false,
  onPermanentDelete,
}: {
  files: FileItem[];
  onPreview: (f: FileItem) => void;
  onDownload: (id: string) => void;
  onRename: (f: FileItem) => void;
  onDelete: (id: string) => void;
  onNewVersion: (f: FileItem) => void;
  onMove?: (f: FileItem) => void;
  onFavorite?: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  favorites: Set<string>;
  canMove?: boolean;
  canPermanentDelete?: boolean;
  onPermanentDelete?: (id: string) => void;
}) {
  if (files.length === 0) return null;

  return (
    <div>
      <h2 className="bpp-label-caps mb-3.5">Files</h2>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            selected={selectedIds.has(file.id)}
            favorited={favorites.has(file.id)}
            onSelect={onToggleSelect}
            onOpen={onPreview}
            onDownload={onDownload}
            onRename={onRename}
            onTrash={onDelete}
            onNewVersion={onNewVersion}
            onMove={onMove}
            onFavorite={onFavorite}
            canMove={canMove}
            canPermanentDelete={canPermanentDelete}
            onPermanentDelete={onPermanentDelete}
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
  onDownload,
  onRename,
  onTrash,
  onNewVersion,
  onMove,
  onFavorite,
  canMove,
  canPermanentDelete,
  onPermanentDelete,
}: {
  file: FileItem;
  selected: boolean;
  favorited: boolean;
  onSelect: (id: string) => void;
  onOpen: (f: FileItem) => void;
  onDownload: (id: string) => void;
  onRename: (f: FileItem) => void;
  onTrash: (id: string) => void;
  onNewVersion: (f: FileItem) => void;
  onMove?: (f: FileItem) => void;
  onFavorite?: (id: string) => void;
  canMove: boolean;
  canPermanentDelete: boolean;
  onPermanentDelete?: (id: string) => void;
}) {
  const ext = getExtension(file.name);
  const badge = getFileTypeBadge(file.name);
  const size = file.currentVersion ? Number(file.currentVersion.sizeBytes) : 0;
  const cardColor = getCardColor(ext);
  const hasMediaThumb = MEDIA_THUMB_EXTS.has(ext);
  const hasPremiumCard = PREMIUM_CARD_EXTS.has(ext);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleContext(e: React.MouseEvent) {
    e.preventDefault();
    setMenuOpen(true);
  }

  function handleMenuMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen((o) => !o);
  }

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition-[transform,box-shadow] duration-250 ease-out will-change-transform hover:-translate-y-0.5 hover:shadow-elevated ${
        selected
          ? 'border-primary/35 ring-2 ring-primary/10 shadow-elevated'
          : 'border-border/55 hover:border-border/80'
      }`}
      onContextMenu={handleContext}
      onDoubleClick={() => onOpen(file)}
      draggable
      onDragStart={(e) => startDrag(e, { kind: 'file', id: file.id })}
      onDragEnd={endDrag}
    >
      <div
        className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br ${cardColor}`}
      >
        {hasMediaThumb ? (
          <FileMediaThumbnail
            key={file.currentVersionId ?? file.id}
            fileId={file.id}
            filename={file.name}
            versionKey={file.currentVersionId}
            variant="grid"
          />
        ) : hasPremiumCard ? (
          <PremiumFileFallback filename={file.name} variant="grid" />
        ) : (
          <FileCardIcon ext={ext} />
        )}

        <label
          className={`absolute left-2.5 top-2.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-opacity ${
            selected
              ? 'border-primary bg-primary'
              : 'border-white/60 bg-white/55 opacity-0 group-hover:opacity-100 dark:border-white/25 dark:bg-black/45'
          }`}
        >
          <input type="checkbox" checked={selected} onChange={() => onSelect(file.id)} className="sr-only" />
          {selected && (
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 8.5 7 11.5 12 5" />
            </svg>
          )}
        </label>

        {favorited && (
          <div className="absolute right-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 shadow-sm">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400 drop-shadow-sm" />
          </div>
        )}
      </div>

      <div className="relative flex flex-1 flex-col gap-2 px-3.5 py-3">
        <p className="line-clamp-2 min-h-[2.5rem] pr-7 text-[13px] font-semibold leading-tight tracking-tight" title={file.name}>
          {file.name}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.color}`}>
            {badge.label}
          </span>
          <span className="min-w-0 flex-1 truncate text-right text-[10px] tabular-nums text-muted-foreground/55">
            {size > 0 ? formatBytes(size) : '—'}
          </span>
          <button
            ref={menuBtnRef}
            type="button"
            onMouseDown={handleMenuMouseDown}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="absolute bottom-3 right-3 shrink-0 rounded-lg p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            aria-label="File actions"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <FileActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuBtnRef}
        onPreview={() => onOpen(file)}
        onDownload={() => onDownload(file.id)}
        onMove={onMove ? () => onMove(file) : undefined}
        canMove={canMove}
        onRename={() => onRename(file)}
        onVersions={() => onOpen(file)}
        onNewVersion={() => onNewVersion(file)}
        onFavorite={onFavorite ? () => onFavorite(file.id) : undefined}
        isFavorited={favorited}
        onTrash={() => onTrash(file.id)}
        onPermanentDelete={onPermanentDelete ? () => onPermanentDelete(file.id) : undefined}
        canPermanentDelete={canPermanentDelete}
      />
    </div>
  );
});
