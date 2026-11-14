import { DangerZoneScreen } from '@/components/mis/settings/danger-zone-screen';
import { getDangerZoneOverview } from '@/server/mis/data-reset';
import { requireMisAccess } from '@/server/mis/guard';

// Backup/restore/clear server actions run under this route segment. Vercel Pro defaults to 60s (R2-385);
// keep this above the longest Prisma transaction timeout in data-reset.ts (180s).
export const maxDuration = 300;

// getDangerZoneOverview() is the gate: it needs data.reset, which only the Owner holds. Everyone else
// gets the 403 page from the (mis) error boundary. No separate role check belongs here.
export default async function DangerZonePage() {
  await requireMisAccess();
  const overview = await getDangerZoneOverview();
  return <DangerZoneScreen overview={overview} />;
}
