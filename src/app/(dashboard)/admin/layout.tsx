import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth';
import { hasPermission } from '@/server/rbac';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect('/login');
  }
  if (!hasPermission(profile.role, 'users:manage')) {
    redirect('/unauthorized');
  }
  return children;
}
