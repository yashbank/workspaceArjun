import { Skeleton, SkeletonTable } from '@/components/mis/kit/skeleton';

/** Shown while this list resolves: title, toolbar card, then table rows. */
export default function ListLoading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-20 w-full" />
      <SkeletonTable />
    </div>
  );
}
