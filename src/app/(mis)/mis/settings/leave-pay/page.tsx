import { requireMisAccess } from '@/server/mis/guard';
import { getLeavePaySettings } from '@/server/mis/leave-pay';
import { LeavePayScreen } from '@/components/mis/settings/leave-pay-screen';
import { PageBack } from '@/components/mis/common/page-back';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// getLeavePaySettings() is the actual gate: it throws MisForbiddenError for
// anyone but OWNER (wages.read), which the (mis) error boundary renders as
// the 403 page — same pattern as /mis/settings/wages.
export default async function LeavePayPage() {
  await requireMisAccess();
  const view = await getLeavePaySettings();
  return (
    <>
      <PageBack href="/mis/settings" label="Settings" />
      <LeavePayScreen view={view} />
    </>
  );
}
