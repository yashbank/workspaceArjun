'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { filePreviewUrl } from '@/lib/preview-url';
import { PremiumFileFallback } from './premium-file-fallback';

/**
 * Grid-card PDF thumbnail: shows the first page's content (top-aligned, fit to
 * width) using the browser's native inline PDF renderer — the same mechanism the
 * preview panel already uses successfully, so no pdf.js dependency and no build
 * risk. The iframe is non-interactive (clicks pass to the card) and only mounts
 * once the card scrolls near the viewport. Any failure falls back to the icon.
 */
export const PdfThumbnail = memo(function PdfThumbnail({
  fileId,
  filename,
  versionKey,
}: {
  fileId: string;
  filename: string;
  versionKey?: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (failed) {
    return <PremiumFileFallback filename={filename} variant="grid" />;
  }

  // toolbar/navpanes off + fit-to-width + page 1, top-aligned content.
  const src = `${filePreviewUrl(fileId, versionKey)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`;

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-white dark:bg-neutral-100">
      {(!inView || !loaded) && (
        <div className="absolute inset-0">
          <PremiumFileFallback filename={filename} variant="grid" />
        </div>
      )}
      {inView && (
        <iframe
          src={src}
          title={filename}
          tabIndex={-1}
          aria-hidden
          loading="lazy"
          className={`pointer-events-none absolute inset-0 h-full w-full border-0 transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
});
