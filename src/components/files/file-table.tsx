'use client';

import {
  Download,
  FileText,
  ImageIcon,
  FileArchive,
  FileIcon,
  MoreVertical,
  Pencil,
  Trash2,
  History,
  UploadCloud,
  ChevronDown,
  ChevronRight,
  Eye,
  FolderInput,
  Star,
  Pen,
} from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { getExtension, getFileTypeBadge, formatBytes, formatDate } from '@/lib/file-utils';
import { FileMediaThumbnail } from './file-media-thumbnail';
import { PremiumFileFallback } from './premium-file-fallback';
import { VersionPanel } from './version-panel';

export type FileItem = {
  id: string;
  name: string;
  mimeType: string | null;
  createdAt: string;
  updatedAt?: string;
  currentVersionId?: string | null;
  _count?: { versions: number };
  currentVersion: {
    sizeBytes: string;
    createdAt: string;
  } | null;
};

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'bmp', 'heic', 'heif']);
const MEDIA_THUMB_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'mp4', 'webm', 'm4v']);
const PREMIUM_LIST_EXTS = new Set(['cdr', 'mov', 'pdf', 'xls', 'xlsx', 'csv', 'heic', 'heif']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);
const DOC_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt']);
const DESIGN_EXTS = new Set(['cdr', 'ai', 'eps', 'psd']);

function FileTypeIcon({ filename }: { filename: string }) {
  const ext = getExtension(filename);
  const cls = 'h-4 w-4 shrink-0';
  if (IMAGE_EXTS.has(ext)) return <ImageIcon className={`${cls} text-sky-500`} />;
  if (ARCHIVE_EXTS.has(ext)) return <FileArchive className={`${cls} text-amber-600`} />;
  if (DESIGN_EXTS.has(ext)) return <Pen className={`${cls} text-purple-500`} />;
  if (DOC_EXTS.has(ext)) return <FileText className={`${cls} text-blue-500`} />;
  return <FileIcon className={`${cls} text-muted-foreground`} />;
}

export function FileTable({
  files,
  onRename,
  onDelete,
  onDownload,
  onNewVersion,
  onPreview,
  onMove,
  onFavorite,
  favorites,
}: {
  files: FileItem[];
  onRename: (f: FileItem) => void;
  onDelete: (id: string) => void;
  onDownload: (id: string) => void;
  onNewVersion: (f: FileItem) => void;
  onPreview?: (f: FileItem) => void;
  onMove?: (f: FileItem) => void;
  onFavorite?: (id: string) => void;
  favorites?: Set<string>;
}) {
  if (files.length === 0) return null;

  return (
    <div>
      <h2 className="bpp-label-caps mb-3.5">Files</h2>
      <div className="bpp-card overflow-hidden">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
              <th className="w-10 px-2 py-3" />
              <th className="w-[min(40%,320px)] px-4 py-3">Name</th>
              <th className="hidden w-24 px-4 py-3 sm:table-cell">Type</th>
              <th className="w-24 px-4 py-3 text-right">Size</th>
              <th className="hidden w-32 px-4 py-3 md:table-cell">Uploaded</th>
              <th className="hidden w-16 px-4 py-3 text-center sm:table-cell">Ver.</th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <FileRowWithVersions
                key={file.id}
                file={file}
                onRename={() => onRename(file)}
                onDelete={() => onDelete(file.id)}
                onDownload={() => onDownload(file.id)}
                onNewVersion={() => onNewVersion(file)}
                onPreview={onPreview ? () => onPreview(file) : undefined}
                onMove={onMove ? () => onMove(file) : undefined}
                onFavorite={onFavorite ? () => onFavorite(file.id) : undefined}
                isFavorited={favorites?.has(file.id) ?? false}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FileRowWithVersions({
  file,
  onRename,
  onDelete,
  onDownload,
  onNewVersion,
  onPreview,
  onMove,
  onFavorite,
  isFavorited,
}: {
  file: FileItem;
  onRename: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onNewVersion: () => void;
  onPreview?: () => void;
  onMove?: () => void;
  onFavorite?: () => void;
  isFavorited: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const ext = getExtension(file.name);
  const size = file.currentVersion ? Number(file.currentVersion.sizeBytes) : 0;
  const badge = getFileTypeBadge(file.name);
  const versionCount = file._count?.versions ?? 1;
  const hasMediaThumb = MEDIA_THUMB_EXTS.has(ext);
  const hasPremiumThumb = PREMIUM_LIST_EXTS.has(ext);

  function openMenu() {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = 300;
      let x = rect.right - menuWidth;
      let y = rect.bottom + 4;
      if (x < 8) x = 8;
      if (y + menuHeight > window.innerHeight) y = rect.top - menuHeight - 4;
      setMenuPos({ x, y });
    }
    setMenuOpen(true);
  }

  return (
    <>
      <tr className="group border-b border-border/30 transition-all duration-150 hover:bg-accent/15 last:border-0" onDoubleClick={onPreview}>
        <td className="px-2 py-2.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-lg p-1 text-muted-foreground/30 transition-all hover:bg-accent hover:text-foreground active:scale-90"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {hasMediaThumb ? (
              <FileMediaThumbnail fileId={file.id} filename={file.name} variant="list" />
            ) : hasPremiumThumb ? (
              <PremiumFileFallback filename={file.name} variant="list" />
            ) : (
              <FileTypeIcon filename={file.name} />
            )}
            <span className="truncate text-[13px] font-semibold tracking-tight" title={file.name}>{file.name}</span>
            {isFavorited && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400 drop-shadow-sm" />}
          </div>
        </td>
        <td className="hidden px-4 py-2.5 sm:table-cell">
          <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.color}`}>
            {badge.label}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground/60">{formatBytes(size)}</td>
        <td className="hidden px-4 py-2.5 text-xs text-muted-foreground/60 md:table-cell">
          {formatDate(file.currentVersion?.createdAt ?? file.createdAt)}
        </td>
        <td className="hidden px-4 py-2.5 text-center sm:table-cell">
          <span className="inline-flex items-center justify-center gap-1 text-[11px] tabular-nums text-muted-foreground/50">
            <History className="h-3 w-3 shrink-0" />
            {versionCount}
          </span>
        </td>
        <td className="px-2 py-2.5 text-right">
          <button
            ref={menuBtnRef}
            onClick={openMenu}
            className="ml-auto rounded-lg p-1.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-accent hover:text-foreground active:scale-90 group-hover:opacity-100 sm:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <ContextMenu
              pos={menuPos}
              onClose={() => setMenuOpen(false)}
              onDownload={onDownload}
              onNewVersion={onNewVersion}
              onVersionHistory={() => setExpanded(true)}
              onRename={onRename}
              onDelete={onDelete}
              onPreview={onPreview}
              onMove={onMove}
              onFavorite={onFavorite}
              isFavorited={isFavorited}
            />
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-muted/8 px-4 py-0">
            <VersionPanel
              fileId={file.id}
              fileName={file.name}
              currentVersionId={file.currentVersionId}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ContextMenu({
  pos,
  onClose,
  onDownload,
  onNewVersion,
  onVersionHistory,
  onRename,
  onDelete,
  onPreview,
  onMove,
  onFavorite,
  isFavorited,
}: {
  pos: { x: number; y: number };
  onClose: () => void;
  onDownload: () => void;
  onNewVersion: () => void;
  onVersionHistory: () => void;
  onRename: () => void;
  onDelete: () => void;
  onPreview?: () => void;
  onMove?: () => void;
  onFavorite?: () => void;
  isFavorited: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[70] w-48 overflow-hidden rounded-xl border border-border/50 bg-popover p-1 shadow-float animate-in scale-in fade-in duration-100"
        style={{ left: pos.x, top: pos.y }}
      >
        {onPreview && <MenuItem icon={Eye} label="Preview" onClick={() => { onClose(); onPreview(); }} />}
        <MenuItem icon={Download} label="Download" onClick={() => { onClose(); onDownload(); }} />
        <MenuItem icon={UploadCloud} label="New version" onClick={() => { onClose(); onNewVersion(); }} />
        <MenuItem icon={History} label="Version history" onClick={() => { onClose(); onVersionHistory(); }} />
        {onMove && <MenuItem icon={FolderInput} label="Move to…" onClick={() => { onClose(); onMove(); }} />}
        {onFavorite && (
          <MenuItem icon={Star} label={isFavorited ? 'Remove star' : 'Add star'} onClick={() => { onClose(); onFavorite(); }} />
        )}
        <div className="my-1 border-t border-border/30" />
        <MenuItem icon={Pencil} label="Rename" onClick={() => { onClose(); onRename(); }} />
        <MenuItem icon={Trash2} label="Delete" onClick={() => { onClose(); onDelete(); }} destructive />
      </div>
    </>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-all active:scale-[0.98] ${destructive ? 'text-destructive hover:bg-destructive/8' : 'hover:bg-accent'}`}
    >
      <Icon className={`h-3.5 w-3.5 ${destructive ? '' : 'text-muted-foreground/50'}`} />
      {label}
    </button>
  );
}
