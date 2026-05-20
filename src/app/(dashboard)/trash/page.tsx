import { getCurrentUser } from '@/server/auth';
import { TrashBrowser } from '@/components/trash/trash-browser';

export default async function TrashPage() {
  const user = await getCurrentUser();
  const canPermanentDelete = user?.role === 'owner';

  return <TrashBrowser canPermanentDelete={canPermanentDelete} />;
}
