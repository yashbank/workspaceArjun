'use client';

import { Loader2 } from 'lucide-react';

/**
 * Fallbacks shown while a lazily code-split chunk (preview panel / dialog) is
 * fetched for the first time. After the chunk is cached, subsequent opens are
 * instant and these never show again.
 */

/** Centered spinner card for first-load of a dialog. */
export function DialogSkeleton() {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4"
      role="status"
      aria-label="Loading"
    >
      <div className="flex items-center gap-2.5 rounded-2xl border border-border/55 bg-card px-5 py-4 shadow-float">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm font-medium text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}

/** Panel-shaped placeholder for first-load of the preview panel. */
export function PreviewPanelSkeleton() {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(92vh,720px)] w-full items-center justify-center rounded-t-2xl border border-border/55 bg-card/98 py-24 shadow-float lg:relative lg:inset-auto lg:z-auto lg:ml-4 lg:max-h-none lg:w-[min(100%,28rem)] lg:rounded-2xl xl:w-[32rem]"
      role="status"
      aria-label="Loading preview"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/40" />
    </div>
  );
}
