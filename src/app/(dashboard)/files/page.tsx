import type { Metadata } from 'next';
import { FileBrowser } from '@/components/files/file-browser';
import { PAGE_TITLES } from '@/lib/site';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac';

export const metadata: Metadata = {
  title: PAGE_TITLES.files,
};

export default async function FilesPage() {
  const user = await getCurrentUser();
  const canDiagnose = user?.role === 'owner' || user?.role === 'admin';
  const canPermanentDelete = user ? hasPermission(user.role, 'files:permanent_delete') : false;
  return <FileBrowser canDiagnose={canDiagnose} canPermanentDelete={canPermanentDelete} />;
}
