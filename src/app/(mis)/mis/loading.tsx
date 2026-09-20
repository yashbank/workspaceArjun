import { Skeleton, SkeletonList } from '@/components/mis/kit/skeleton';

/**
 * Shown while a screen resolves.
 *
 * A factory connection is often one bar; a blank frame reads as broken where a
 * shimmer reads as coming.
 */
export default function MisLoading() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Skeleton className="h-7 w-56" />
      <SkeletonList rows={3} />
    </div>
  );
}
