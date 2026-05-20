'use client';

import { Film, Smartphone } from 'lucide-react';
import { memo, useState } from 'react';
import { getExtension } from '@/lib/file-utils';

const PREVIEW_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff']);
const IMAGE_FALLBACK_EXTS = new Set(['heic', 'heif']);
const VIDEO_THUMB_EXTS = new Set(['mp4', 'webm', 'm4v']);
const MOV_EXT = 'mov';

type FileMediaThumbnailProps = {
  fileId: string;
  filename: string;
  className?: string;
  variant?: 'grid' | 'list';
};

function MovFallback({ variant }: { variant: 'grid' | 'list' }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-pink-50 to-pink-100/70 dark:from-pink-950/40 dark:to-pink-900/25">
      <Film className={`${variant === 'list' ? 'h-4 w-4' : 'h-8 w-8'} text-pink-600 dark:text-pink-400`} />
      {variant === 'grid' && (
        <span className="text-[9px] font-bold uppercase tracking-wider text-pink-700/70 dark:text-pink-300/80">
          QuickTime
        </span>
      )}
    </div>
  );
}

export const FileMediaThumbnail = memo(function FileMediaThumbnail({
  fileId,
  filename,
  className = '',
  variant = 'grid',
}: FileMediaThumbnailProps) {
  const ext = getExtension(filename);
  const previewSrc = `/api/files/${fileId}/preview`;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const isImage = PREVIEW_IMAGE_EXTS.has(ext);
  const isHeic = IMAGE_FALLBACK_EXTS.has(ext);
  const isVideoThumb = VIDEO_THUMB_EXTS.has(ext);
  const isMov = ext === MOV_EXT;

  const sizeClass =
    variant === 'list'
      ? 'h-9 w-9 shrink-0 rounded-lg'
      : 'absolute inset-0 h-full w-full';

  const showShimmer = !loaded && !error && (isImage || isVideoThumb || (isMov && !error));

  if (!isImage && !isHeic && !isVideoThumb && !isMov) return null;

  if (isHeic) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-sky-50 to-sky-100/60 dark:from-sky-950/30 dark:to-sky-900/20 ${sizeClass} ${className}`}
      >
        <Smartphone className="h-4 w-4 text-sky-600 dark:text-sky-400" />
      </div>
    );
  }

  if (isMov) {
    if (error) {
      return (
        <div className={`relative overflow-hidden ${sizeClass} ${className}`}>
          <MovFallback variant={variant} />
        </div>
      );
    }
    return (
      <div className={`relative overflow-hidden ${sizeClass} ${className}`}>
        {showShimmer && (
          <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer" />
        )}
        <video
          src={previewSrc}
          preload="metadata"
          muted
          playsInline
          className={`${sizeClass} object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {!loaded && !error && variant === 'grid' && (
          <div className="pointer-events-none absolute inset-0">
            <MovFallback variant={variant} />
          </div>
        )}
        {loaded && variant === 'grid' && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
        )}
      </div>
    );
  }

  if (isVideoThumb) {
    return (
      <div className={`relative overflow-hidden ${sizeClass} ${className}`}>
        {showShimmer && (
          <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer" />
        )}
        <video
          src={previewSrc}
          preload="metadata"
          muted
          playsInline
          className={`${sizeClass} object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoadedData={() => setLoaded(true)}
          onError={() => setError(true)}
        />
        {loaded && variant === 'grid' && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-50 to-pink-100/60 dark:from-pink-950/30 dark:to-pink-900/20">
            <Film className="h-6 w-6 text-pink-600 dark:text-pink-400" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${sizeClass} ${className}`}>
      {showShimmer && (
        <div className="absolute inset-0 bg-shimmer bg-[length:200%_100%] animate-shimmer" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSrc}
        alt=""
        className={`${sizeClass} object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {loaded && variant === 'grid' && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
      )}
    </div>
  );
});
