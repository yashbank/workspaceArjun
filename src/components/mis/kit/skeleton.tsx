import { cn } from '@/lib/utils';

/**
 * Loading placeholder.
 *
 * A factory connection is often one bar of 3G; a blank frame reads as "broken"
 * where a shimmer reads as "coming".
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-shimmer rounded-md bg-shimmer', className)} />;
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

/** Table-shaped placeholder: a header strip then `rows` rows of `cols` cells. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}
