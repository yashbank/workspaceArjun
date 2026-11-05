import { SkeletonList } from '@/components/mis/kit';

export default function Loading() {
  return (
    <div className="p-6">
      <SkeletonList rows={6} />
    </div>
  );
}
