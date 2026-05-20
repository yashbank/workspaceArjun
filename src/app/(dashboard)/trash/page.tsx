import type { Metadata } from 'next';
import { getCurrentUser } from '@/server/auth';
import { TrashBrowser } from '@/components/trash/trash-browser';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.trash,
};

export default async function TrashPage() {
  const user = await getCurrentUser();
  const canPermanentDelete = user?.role === 'owner';

  return <TrashBrowser canPermanentDelete={canPermanentDelete} />;
}
