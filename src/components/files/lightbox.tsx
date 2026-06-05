'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCw,
} from 'lucide-react';
import { getExtension } from '@/lib/file-utils';
import { filePreviewUrl } from '@/lib/preview-url';
import type { FileItem } from './file-table';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp']);
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const FIT_ZOOM = -1;

export function Lightbox({
  file,
  files,
  onClose,
  onNavigate,
  onDownload,
}: {
  file: FileItem;
  files: FileItem[];
  onClose: () => void;
  onNavigate: (f: FileItem) => void;
  onDownload: () => void;
}) {
  const [zoom, setZoom] = useState(FIT_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIdx = files.findIndex((f) => f.id === file.id);
  const imageFiles = files.filter((f) => IMAGE_EXTS.has(getExtension(f.name)));
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < files.length - 1;

  const isFit = zoom === FIT_ZOOM;

  const resetView = useCallback(() => {
    setZoom(FIT_ZOOM);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset view state on file navigation
    resetView();
    setImgNatural({ w: 0, h: 0 });
  }, [file.id, resetView]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) { onNavigate(files[currentIdx - 1]); }
      if (e.key === 'ArrowRight' && hasNext) { onNavigate(files[currentIdx + 1]); }
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') resetView();
      if (e.key === 'r') setRotation((r) => (r + 90) % 360);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPrev, hasNext, currentIdx, files, onClose, onNavigate, zoom]);

  function handleZoomIn() {
    setZoom((prev) => {
      const curr = prev === FIT_ZOOM ? 1 : prev;
      const next = ZOOM_STEPS.find((z) => z > curr);
      return next ?? curr;
    });
    setPan({ x: 0, y: 0 });
  }

  function handleZoomOut() {
    setZoom((prev) => {
      const curr = prev === FIT_ZOOM ? 1 : prev;
      const next = [...ZOOM_STEPS].reverse().find((z) => z < curr);
      return next ?? FIT_ZOOM;
    });
    setPan({ x: 0, y: 0 });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    if (e.deltaY < 0) handleZoomIn();
    else handleZoomOut();
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (isFit) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
  }

  function handlePointerUp() {
    setDragging(false);
  }

  function handleDoubleClick() {
    if (isFit) {
      setZoom(2);
      setPan({ x: 0, y: 0 });
    } else {
      resetView();
    }
  }

  const previewSrc = filePreviewUrl(file.id, file.currentVersionId);
  const displayZoom = isFit ? 'Fit' : `${Math.round(zoom * 100)}%`;

  const imgStyle: React.CSSProperties = isFit
    ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' as const, transform: `rotate(${rotation}deg)` }
    : {
        width: imgNatural.w ? imgNatural.w * zoom : 'auto',
        height: imgNatural.h ? imgNatural.h * zoom : 'auto',
        transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg)`,
        cursor: dragging ? 'grabbing' : 'grab',
      };

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 animate-in fade-in duration-200">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="rounded-lg p-2 text-white/70 transition-all hover:bg-white/10 hover:text-white" title="Close (Esc)">
            <X className="h-5 w-5" />
          </button>
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="max-w-[300px] truncate text-sm font-medium text-white/90">{file.name}</span>
            <span className="text-xs text-white/40">
              {currentIdx + 1} / {files.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={handleZoomOut} className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white" title="Zoom out (−)">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-xs tabular-nums text-white/50">{displayZoom}</span>
          <button onClick={handleZoomIn} className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white" title="Zoom in (+)">
            <ZoomIn className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            title="Rotate (R)"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => (isFit ? setZoom(1) : resetView())}
            className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            title={isFit ? 'Actual size (0)' : 'Fit to screen (0)'}
          >
            {isFit ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
          <div className="mx-1 h-4 w-px bg-white/10" />
          <button onClick={onDownload} className="rounded-lg p-2 text-white/60 transition-all hover:bg-white/10 hover:text-white" title="Download">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image canvas */}
      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Navigation arrows */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(files[currentIdx - 1]); }}
            className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(files[currentIdx + 1]); }}
            className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={file.id}
          src={previewSrc}
          alt={file.name}
          style={imgStyle}
          className={`select-none transition-transform ${isFit ? 'duration-300' : 'duration-0'}`}
          draggable={false}
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
      </div>

      {/* Filmstrip */}
      {imageFiles.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 bg-black/60 px-4 py-2.5">
          {imageFiles.map((f) => {
            const isActive = f.id === file.id;
            return (
              <button
                key={f.id}
                onClick={() => onNavigate(f)}
                className={`shrink-0 overflow-hidden rounded-md border-2 transition-all ${isActive ? 'border-white/80 shadow-lg shadow-white/10' : 'border-transparent opacity-40 hover:opacity-70'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={filePreviewUrl(f.id, f.currentVersionId)}
                  alt=""
                  className="h-10 w-10 object-cover"
                  loading="lazy"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
