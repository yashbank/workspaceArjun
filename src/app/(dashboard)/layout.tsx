import { getCurrentUser } from '@/server/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { KeyboardShortcuts } from '@/components/shell/keyboard-shortcuts';
import { GlobalKeys } from '@/components/shell/global-keys';
import { GuidedTour } from '@/components/shell/guided-tour';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();

  if (!profile) {
    redirect('/login');
  }

  if (profile.status === 'deactivated') {
    redirect('/unauthorized');
  }

  const showAdminNav = profile.role === 'owner' || profile.role === 'admin';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar showAdminNav={showAdminNav} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          userEmail={profile.email}
          userName={profile.name ?? undefined}
          userRole={profile.role}
        />
        <main className="flex-1 overflow-auto bg-muted/20 p-6">
          <div className="animate-in content-reveal duration-300">
            {children}
          </div>
        </main>
      </div>
      <KeyboardShortcuts />
      <GlobalKeys />
      <GuidedTour />
    </div>
  );
}
