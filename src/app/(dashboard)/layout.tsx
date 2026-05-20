import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, hasPendingInviteForEmail } from '@/server/auth';
import { isDatabaseConnectionError } from '@/server/db';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { KeyboardShortcuts } from '@/components/shell/keyboard-shortcuts';
import { GlobalKeys } from '@/components/shell/global-keys';
import { GuidedTour } from '@/components/shell/guided-tour';
import { DbConnectionIssue } from '@/components/shell/db-connection-issue';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (authUser?.email) {
    const pendingInvite = await hasPendingInviteForEmail(authUser.email);
    if (pendingInvite) {
      redirect('/invite/accept');
    }
  }

  let profile;
  try {
    profile = await getCurrentUser();
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[dashboard] database connection failed:', error);
      }
      return <DbConnectionIssue />;
    }
    throw error;
  }

  if (!profile) {
    redirect('/login');
  }

  if (profile.status === 'deactivated') {
    redirect('/unauthorized');
  }

  const showAdminNav = profile.role === 'owner' || profile.role === 'admin';
  const showSettingsNav = profile.role === 'owner';

  return (
    <div className="flex h-screen overflow-hidden bg-background bpp-subtle-bg">
      <Sidebar showAdminNav={showAdminNav} showSettingsNav={showSettingsNav} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          userEmail={profile.email}
          userName={profile.name ?? undefined}
          userRole={profile.role}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="animate-in content-reveal duration-300">{children}</div>
        </main>
      </div>
      <KeyboardShortcuts />
      <GlobalKeys />
      <GuidedTour />
    </div>
  );
}
