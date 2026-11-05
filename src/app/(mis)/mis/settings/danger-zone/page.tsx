import { DangerZoneScreen } from '@/components/mis/settings/danger-zone-screen';
import { getDangerZoneOverview } from '@/server/mis/data-reset';
import { requireMisAccess } from '@/server/mis/guard';

// getDangerZoneOverview() is the gate: it needs data.reset, which only the Owner holds. Everyone else
// gets the 403 page from the (mis) error boundary. No separate role check belongs here.
export default async function DangerZonePage() {
  await requireMisAccess();
  const overview = await getDangerZoneOverview();
  return <DangerZoneScreen overview={overview} />;
}
