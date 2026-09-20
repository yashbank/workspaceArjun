import { DeviceListScreen } from '@/components/mis/kiosk/device-list-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listDevices } from '@/server/mis/kiosk-device';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// listDevices() is the gate: it needs kiosk.manage (Owner, Admin — D18) and
// throws MisForbiddenError for everyone else, which the (mis) error boundary
// renders as the 403 page. No separate role check belongs here.
export default async function DevicesPage() {
  await requireMisAccess();
  const now = new Date();
  const devices = await listDevices(now);
  return <DeviceListScreen devices={devices} asOf={now.toISOString()} />;
}
