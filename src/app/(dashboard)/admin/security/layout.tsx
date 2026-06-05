import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.security,
};

export default async function AdminSecurityLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect('/login');
  }
  if (!hasPermission(profile.role, 'users:manage')) {
    redirect('/unauthorized');
  }
  return children;
}
