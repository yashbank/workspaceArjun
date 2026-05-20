import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, hasPendingInviteForEmail } from '@/server/auth';
import { isDatabaseConnectionError } from '@/server/db';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { KeyboardShortcuts } from '@/components/shell/keyboard-shortcuts';
import { GlobalKeys } from '@/components/shell/global-keys';
import { GuidedTour } from '@/components/shell/guided-tour';
import { DbConnectionIssue } from '@/components/shell/db-connection-issue';
import { DisplayNameGuard } from '@/components/shell/display-name-guard';
import { needsDisplayNameSetup } from '@/lib/user-display';
import { userHasDuplicateDisplayName } from '@/server/profile';

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
  const showActivityNav = profile.role === 'owner' || profile.role === 'admin';
  const hasDuplicateName = await userHasDuplicateDisplayName(profile.id);

  return (
    <>
      <DisplayNameGuard
        needsSetup={needsDisplayNameSetup(profile.name, hasDuplicateName)}
      >
        <DashboardShell
          showAdminNav={showAdminNav}
          showSettingsNav={showSettingsNav}
          showActivityNav={showActivityNav}
          userEmail={profile.email}
          userName={profile.name ?? undefined}
          userRole={profile.role}
        >
          {children}
        </DashboardShell>
      </DisplayNameGuard>
      <KeyboardShortcuts />
      <GlobalKeys />
      <GuidedTour />
    </>
  );
}
