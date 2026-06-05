'use client';

import { Film, Smartphone } from 'lucide-react';
import { memo, useState } from 'react';
import { getExtension } from '@/lib/file-utils';
import { filePreviewUrl } from '@/lib/preview-url';
import { fileThumbnailUrl } from '@/lib/thumbnail-url';
import { isThumbnailable } from '@/lib/thumbnail-format';

const PREVIEW_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff']);
const IMAGE_FALLBACK_EXTS = new Set(['heic', 'heif']);
const VIDEO_THUMB_EXTS = new Set(['mp4', 'webm', 'm4v']);
const MOV_EXT = 'mov';

type FileMediaThumbnailProps = {
  fileId: string;
  filename: string;
  /** Current version id — keys the thumbnail URL so it refreshes on new versions. */
  versionKey?: string | null;
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
  versionKey,
  className = '',
  variant = 'grid',
}: FileMediaThumbnailProps) {
  const ext = getExtension(filename);
  const previewSrc = filePreviewUrl(fileId, versionKey);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  // NOTE: transient state (loaded/error/thumbFailed) is reset on a version change
  // by remounting — call sites pass `key={currentVersionId}` — so a new upload or
  // replace re-attempts the optimized thumbnail and clears any prior error.
  const isImage = PREVIEW_IMAGE_EXTS.has(ext);
  // Use the small optimized thumbnail for supported raster images (svg/heic are
  // not thumbnailable and keep the preview/card path). 256px in grid, 96px in list.
  const canThumbnail = isThumbnailable(ext);
  const thumbWidth = variant === 'list' ? 96 : 256;
  const imageSrc =
    canThumbnail && !thumbFailed ? fileThumbnailUrl(fileId, versionKey, thumbWidth) : previewSrc;
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
        src={imageSrc}
        alt=""
        className={`${sizeClass} object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          // Optimized thumbnail failed → fall back to the full preview URL; if
          // that also fails, give up gracefully (no broken-image icon).
          if (canThumbnail && !thumbFailed) setThumbFailed(true);
          else setError(true);
        }}
      />
      {loaded && variant === 'grid' && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />
      )}
    </div>
  );
});
