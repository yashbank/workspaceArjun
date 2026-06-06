import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, hasPendingInviteForEmail } from '@/server/auth';
import { isDatabaseConnectionError } from '@/server/db';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { KeyboardShortcuts } from '@/components/shell/keyboard-shortcuts';
import { GlobalKeys } from '@/components/shell/global-keys';
import { GuidedTour } from '@/components/shell/guided-tour';
import { RoutePrefetcher } from '@/components/shell/route-prefetcher';
import { DbConnectionIssue } from '@/components/shell/db-connection-issue';
import { DisplayNameGuard } from '@/components/shell/display-name-guard';
import { needsDisplayNameSetup } from '@/lib/user-display';
import { userHasDuplicateDisplayName } from '@/server/profile';
import { resolveAccessDecision, logAccessDenial } from '@/server/access/decision';
import { isAccessEnforced, isAccessDetectionEnabled } from '@/server/access';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // The pending-invite check and the profile load both depend only on the
  // session, so run them in parallel instead of as a sequential waterfall.
  let pendingInvite = false;
  let profile;
  try {
    [pendingInvite, profile] = await Promise.all([
      authUser?.email ? hasPendingInviteForEmail(authUser.email) : Promise.resolve(false),
      getCurrentUser(),
    ]);
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[dashboard] database connection failed:', error);
      }
      return <DbConnectionIssue />;
    }
    throw error;
  }

  if (pendingInvite) {
    redirect('/invite/accept');
  }
  if (!profile) {
    redirect('/login');
  }
  if (profile.status === 'deactivated') {
    redirect('/unauthorized');
  }

  // Access control — observe the IP/device policy and record would-be denials.
  // When ACCESS_ENFORCE=true, a blocked member is redirected to the block screen
  // (covering Files/Dashboard/Admin/Activity/Trash, all under this layout);
  // otherwise it stays log-only. The decision and the display-name check both
  // depend only on the profile, so they run in parallel; the access decision
  // fails open (lookup errors never break the dashboard). redirect() is called
  // OUTSIDE any try so its NEXT_REDIRECT control flow is never swallowed.
  // ACCESS_DETECTION=off disables observation entirely.
  const [decision, hasDuplicateName] = await Promise.all([
    isAccessDetectionEnabled()
      ? resolveAccessDecision(profile).catch((error) => {
          if (process.env.NODE_ENV === 'development') {
            console.error('[access] observation failed:', error);
          }
          return null;
        })
      : Promise.resolve(null),
    userHasDuplicateDisplayName(profile.id),
  ]);

  let accessBlocked = false;
  if (decision?.wouldBlock) {
    await logAccessDenial(profile, decision);
    accessBlocked = true;
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[access] would-block (layout) user=${profile.id} ip=${decision.ip ?? 'unknown'} mode=${profile.accessMode} enforce=${isAccessEnforced()}`,
      );
    }
  }
  if (accessBlocked && isAccessEnforced()) {
    redirect('/access-blocked');
  }

  const showAdminNav = profile.role === 'owner' || profile.role === 'admin';
  const showSettingsNav = profile.role === 'owner';
  const showActivityNav = profile.role === 'owner' || profile.role === 'admin';

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
      <RoutePrefetcher
        canAdmin={showAdminNav}
        canSettings={showSettingsNav}
        canActivity={showActivityNav}
      />
      <KeyboardShortcuts />
      <GlobalKeys />
      <GuidedTour />
    </>
  );
}
