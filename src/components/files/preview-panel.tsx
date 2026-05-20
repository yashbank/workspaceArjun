'use client';

import {
  X,
  Download,
  FileText,
  ImageIcon,
  History,
  Star,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Loader2,
  AlertCircle,
  FileArchive,
  FileSpreadsheet,
  Pen,
  FileIcon,
  Clock,
  Weight,
  Layers,
  Expand,
} from 'lucide-react';
import { getExtension, getFileTypeBadge, formatBytes, formatDate } from '@/lib/file-utils';
import {
  STORAGE_CONTENT_MISSING_MESSAGE,
  isStorageContentMissingPayload,
  parseApiErrorMessage,
} from '@/lib/storage-errors';
import { memo, useEffect, useRef, useState } from 'react';
import type { FileItem } from './file-table';
import { Lightbox } from './lightbox';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const PDF_EXT = 'pdf';
const DESIGN_EXTS = new Set(['cdr', 'ai', 'eps', 'psd', 'indd', 'sketch', 'fig', 'xd']);
const SPREADSHEET_EXTS = new Set(['xls', 'xlsx', 'csv']);

const EXT_META: Record<string, { label: string; app: string }> = {
  cdr: { label: 'CorelDRAW', app: 'CorelDRAW' },
  ai:  { label: 'Illustrator', app: 'Adobe Illustrator' },
  eps: { label: 'EPS', app: 'PostScript' },
  psd: { label: 'Photoshop', app: 'Adobe Photoshop' },
  indd: { label: 'InDesign', app: 'Adobe InDesign' },
  xls: { label: 'Spreadsheet', app: 'Microsoft Excel' },
  xlsx:{ label: 'Spreadsheet', app: 'Microsoft Excel' },
  csv: { label: 'CSV', app: 'Spreadsheet' },
  sketch: { label: 'Sketch', app: 'Sketch' },
  fig: { label: 'Figma', app: 'Figma' },
  xd: { label: 'XD', app: 'Adobe XD' },
};

function getFileIcon(ext: string) {
  if (IMAGE_EXTS.has(ext)) return <ImageIcon className="h-11 w-11 text-sky-500 drop-shadow-sm" />;
  if (ext === PDF_EXT) return <FileText className="h-11 w-11 text-red-500 drop-shadow-sm" />;
  if (DESIGN_EXTS.has(ext)) return <Pen className="h-11 w-11 text-purple-500 drop-shadow-sm" />;
  if (SPREADSHEET_EXTS.has(ext)) return <FileSpreadsheet className="h-11 w-11 text-emerald-500 drop-shadow-sm" />;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return <FileArchive className="h-11 w-11 text-amber-500 drop-shadow-sm" />;
  return <FileIcon className="h-11 w-11 text-muted-foreground drop-shadow-sm" />;
}

function getIconBgColor(ext: string) {
  if (IMAGE_EXTS.has(ext)) return 'bg-gradient-to-br from-sky-100 to-sky-50 dark:from-sky-900/30 dark:to-sky-800/20';
  if (ext === PDF_EXT) return 'bg-gradient-to-br from-red-100 to-red-50 dark:from-red-900/30 dark:to-red-800/20';
  if (DESIGN_EXTS.has(ext)) return 'bg-gradient-to-br from-purple-100 to-purple-50 dark:from-purple-900/30 dark:to-purple-800/20';
  if (SPREADSHEET_EXTS.has(ext)) return 'bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-800/20';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20';
  return 'bg-muted/40';
}

export const PreviewPanel = memo(function PreviewPanel({
  file,
  files,
  onClose,
  onNavigate,
  onDownload,
  onNewVersion,
  onFavorite,
  isFavorited,
}: {
  file: FileItem;
  files: FileItem[];
  onClose: () => void;
  onNavigate: (f: FileItem) => void;
  onDownload: () => void;
  onNewVersion?: () => void;
  onFavorite: () => void;
  isFavorited: boolean;
}) {
  const ext = getExtension(file.name);
  const badge = getFileTypeBadge(file.name);
  const size = file.currentVersion ? Number(file.currentVersion.sizeBytes) : 0;
  const versionCount = file._count?.versions ?? 1;

  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = ext === PDF_EXT;
  const canPreview = isImage || isPdf;

  const [imgError, setImgError] = useState(false);
  const [imgErrorMessage, setImgErrorMessage] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const currentIdx = files.findIndex((f) => f.id === file.id);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < files.length - 1;
  const previewSrc = `/api/files/${file.id}/preview`;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on file change
    setImgError(false);
    setImgErrorMessage(null);
    setImgLoaded(false);
  }, [file.id]);

  async function handlePreviewLoadError() {
    setImgError(true);
    try {
      const res = await fetch(previewSrc);
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        if (isStorageContentMissingPayload(payload)) {
          setImgErrorMessage(STORAGE_CONTENT_MISSING_MESSAGE);
          return;
        }
        setImgErrorMessage(parseApiErrorMessage(payload, 'Preview unavailable'));
      }
    } catch {
      setImgErrorMessage('Preview unavailable');
    }
  }

  useEffect(() => {
    if (filmstripRef.current) {
      const active = filmstripRef.current.querySelector('[data-active="true"]');
      active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [file.id]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (showLightbox) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(files[currentIdx - 1]);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(files[currentIdx + 1]);
      if (e.key === ' ' && isImage) { e.preventDefault(); setShowLightbox(true); }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, hasPrev, hasNext, currentIdx, files, onNavigate, showLightbox, isImage]);

  const extMeta = EXT_META[ext];

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(92vh,720px)] w-full flex-col overflow-hidden rounded-t-2xl border border-border/55 bg-card shadow-float animate-in drawer-in fade-in duration-300 lg:relative lg:inset-auto lg:z-auto lg:ml-4 lg:max-h-none lg:w-[min(100%,28rem)] lg:rounded-2xl xl:w-[32rem]">
        {/* Header — glass toolbar */}
        <div className="glass flex items-center justify-between border-b border-border/45 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground/60 transition-all hover:bg-accent hover:text-foreground active:scale-95" title="Close (Esc)">
              <X className="h-4 w-4" />
            </button>
            <div className="h-3.5 w-px bg-border/40" />
            <div className="flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/50">
              <span className="font-semibold text-foreground/60">{currentIdx + 1}</span>
              <span>/</span>
              <span>{files.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={onFavorite}
              className={`rounded-lg p-1.5 transition-all active:scale-90 ${isFavorited ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground/40 hover:bg-accent hover:text-amber-500'}`}
              title={isFavorited ? 'Remove star' : 'Add star'}
            >
              <Star className={`h-4 w-4 ${isFavorited ? 'fill-current' : ''}`} />
            </button>
            <div className="mx-1 h-3.5 w-px bg-border/40" />
            <button
              onClick={() => hasPrev && onNavigate(files[currentIdx - 1])}
              disabled={!hasPrev}
              className="rounded-lg p-1.5 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground disabled:opacity-15 active:scale-90"
              title="Previous (←)"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => hasNext && onNavigate(files[currentIdx + 1])}
              disabled={!hasNext}
              className="rounded-lg p-1.5 text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground disabled:opacity-15 active:scale-90"
              title="Next (→)"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Hero preview */}
        <div className="relative flex min-h-[380px] items-center justify-center overflow-hidden bg-muted/15">
          {isImage && !imgError ? (
            <div
              className="group relative flex h-full w-full cursor-pointer items-center justify-center p-4"
              onClick={() => setShowLightbox(true)}
            >
              {!imgLoaded && (
                <div className="absolute inset-0 z-10 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2.5">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
                    <span className="text-[10px] font-medium text-muted-foreground/30">Loading</span>
                  </div>
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={file.id}
                src={previewSrc}
                alt={file.name}
                className={`max-h-[400px] w-full rounded-xl object-contain shadow-card transition-all duration-600 ease-out ${imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.96]'}`}
                onLoad={() => setImgLoaded(true)}
                onError={() => void handlePreviewLoadError()}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100">
                <div className="flex items-center gap-2 rounded-xl bg-black/50 px-4 py-2.5 text-[11px] font-semibold text-white/90 shadow-lg backdrop-blur-md">
                  <Expand className="h-3.5 w-3.5" />
                  Expand
                </div>
              </div>
            </div>
          ) : isPdf && !imgError ? (
            <div className="flex h-[440px] w-full flex-col">
              <div className="glass flex items-center gap-2.5 border-b border-border/30 px-4 py-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10">
                  <FileText className="h-3.5 w-3.5 text-red-500" />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground/70">Document</span>
                <span className="ml-auto rounded-md bg-muted/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">PDF</span>
              </div>
              <iframe
                key={file.id}
                src={previewSrc}
                className="flex-1 border-0"
                title={file.name}
                onError={() => void handlePreviewLoadError()}
              />
            </div>
          ) : canPreview && imgError ? (
            <div className="flex flex-col items-center gap-5 py-16 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/6">
                <AlertCircle className="h-7 w-7 text-destructive/40" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground/70">Preview unavailable</p>
                <p className="mt-1 max-w-xs text-xs text-muted-foreground/60">
                  {imgErrorMessage ?? 'File may be missing from storage'}
                </p>
              </div>
              <button onClick={onDownload} className="rounded-xl border bg-card px-5 py-2.5 text-xs font-semibold shadow-card transition-all hover:shadow-elevated active:scale-[0.97]">
                Download instead
              </button>
            </div>
          ) : (
            /* Premium unsupported-file card */
            <div className="flex w-full flex-col items-center gap-6 px-10 py-14">
              <div className={`flex h-24 w-24 items-center justify-center rounded-[28px] shadow-card ${getIconBgColor(ext)}`}>
                {getFileIcon(ext)}
              </div>
              <div className="text-center">
                <span className={`inline-block rounded-lg px-3 py-1 text-[11px] font-bold tracking-wide ${badge.color}`}>
                  .{ext.toUpperCase() || '?'}
                </span>
                {extMeta && (
                  <p className="mt-2.5 text-xs font-medium text-muted-foreground/60">{extMeta.app}</p>
                )}
              </div>
              <div className="w-full max-w-[280px] space-y-0 overflow-hidden rounded-xl border shadow-card">
                <MetaRow icon={Weight} label="Size" value={formatBytes(size)} />
                <MetaRow icon={Clock} label="Uploaded" value={formatDate(file.createdAt)} border />
                <MetaRow icon={Layers} label="Version" value={`v${versionCount}`} border />
              </div>
              <p className="text-center text-[11px] text-muted-foreground/40">
                Download to open in {extMeta?.app ?? 'its native application'}
              </p>
            </div>
          )}
        </div>

        {/* File info + actions */}
        <div className="space-y-4 border-t border-border/45 bg-card p-4">
          <div>
            <p className="truncate text-[14px] font-semibold leading-snug tracking-tight" title={file.name}>
              {file.name}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/55">
              <span className="font-medium tabular-nums">{formatBytes(size)}</span>
              <span className="opacity-30">·</span>
              <span className="uppercase tracking-wide">{ext}</span>
              <span className="opacity-30">·</span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <History className="h-2.5 w-2.5" /> v{versionCount}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={onDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[12px] font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            {onNewVersion && (
              <button
                onClick={onNewVersion}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-accent/30 px-3 py-2.5 text-[12px] font-semibold transition-all hover:bg-accent hover:shadow-card active:scale-[0.97]"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                New version
              </button>
            )}
          </div>
        </div>

        {/* Filmstrip */}
        {files.length > 1 && (
          <div className="border-t border-border/40 bg-muted/15 px-3 py-3">
            <div ref={filmstripRef} className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {files.map((f, i) => {
                const fExt = getExtension(f.name);
                const isActive = f.id === file.id;
                const isImg = IMAGE_EXTS.has(fExt);
                return (
                  <button
                    key={f.id}
                    data-active={isActive}
                    onClick={() => onNavigate(f)}
                    className={`shrink-0 overflow-hidden rounded-lg transition-all duration-200 ${isActive ? 'ring-2 ring-primary/40 ring-offset-1 ring-offset-card shadow-sm' : 'opacity-35 hover:opacity-60'}`}
                    title={f.name}
                  >
                    {isImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/files/${f.id}/preview`} alt="" className="h-10 w-10 object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center bg-muted/20 text-[8px] font-bold uppercase text-muted-foreground/60">
                        {fExt.slice(0, 3) || (i + 1).toString()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showLightbox && isImage && (
        <Lightbox
          file={file}
          files={files}
          onClose={() => setShowLightbox(false)}
          onNavigate={(f) => { onNavigate(f); }}
          onDownload={onDownload}
        />
      )}
    </>
  );
});

function MetaRow({ icon: Icon, label, value, border }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3.5 py-2.5 text-xs ${border ? 'border-t border-border/30' : ''}`}>
      <span className="flex items-center gap-2 text-muted-foreground/50">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
