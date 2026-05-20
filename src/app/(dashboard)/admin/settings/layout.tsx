import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.settings,
};

export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect('/login');
  }
  if (!hasPermission(profile.role, 'settings:manage')) {
    redirect('/unauthorized');
  }
  return children;
}
