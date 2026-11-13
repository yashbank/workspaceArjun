import { PageBack } from '@/components/mis/common/page-back';
import { AccountScreen } from '@/components/mis/me/account-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { mustChangePassword, syncOwnProfileEmail } from '@/server/mis/account';
import { getCurrentUser } from '@/server/auth';

/** Change my own email and password — reachable from the Me tab for every role. */
export default async function MisAccountPage() {
  await requireMisAccess();
  await syncOwnProfileEmail().catch(() => undefined);
  // getCurrentUser is request-cached: the email shown is read after the sync above only on next load.
  const [user, mustChange] = await Promise.all([getCurrentUser(), mustChangePassword()]);
  return (
    <>
      <PageBack href="/mis/me" label="Me" />
      <AccountScreen email={user?.email ?? ''} mustChange={mustChange} />
    </>
  );
}
