import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac/permissions';
import { ActivityBrowser } from '@/components/activity/activity-browser';
import { PAGE_TITLES } from '@/lib/site';

export const metadata: Metadata = {
  title: PAGE_TITLES.activity,
};

export default async function ActivityPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, 'audit:read')) {
    redirect('/');
  }

  return <ActivityBrowser isOwner={user.role === 'owner'} />;
}
