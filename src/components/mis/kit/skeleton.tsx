import { cn } from '@/lib/utils';

/**
 * Loading placeholder.
 *
 * A factory connection is often one bar of 3G; a blank frame reads as "broken"
 * where a shimmer reads as "coming".
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200', className)}
    />
  );
}

/** The list shape most MIS screens fall back to while loading. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
