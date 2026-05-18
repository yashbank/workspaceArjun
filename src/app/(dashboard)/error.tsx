'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, FolderOpen } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[dashboard] route error:', error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">Dashboard unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground/70">
        Something went wrong loading your workspace overview. Your files and account are unaffected.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-card transition-all hover:shadow-elevated active:scale-[0.97]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          href="/files"
          className="inline-flex items-center gap-2 rounded-xl border border-border/50 px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-all hover:bg-accent/30 active:scale-[0.97]"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Go to Files
        </Link>
      </div>
    </div>
  );
}
