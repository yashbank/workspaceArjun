import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { QcGridScreen } from '@/components/mis/qc/qc-grid-screen';
import { db } from '@/server/db';
import { getQcHourlyGrid } from '@/server/mis/qc-grid';
import { QcGridDesktop } from '@/components/mis/desktop/qc-grid-desktop';
import type { QcGridView } from '@/lib/mis/qc-grid';
import { isMisForbiddenError } from '@/server/mis/auth';

async function getTodayQcChecks() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return db.misQcCheck.findMany({
    where: { checkTime: { gte: today, lt: tomorrow } },
    include: {
      order: { select: { orderNumber: true } },
    },
    orderBy: { checkTime: 'asc' },
  }).catch(() => []);
}

export default async function QcGridPage({ searchParams }: { searchParams: Promise<{ view?: string; shift?: string; date?: string }> }) {
  const sp = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'qc.write');
  const orders = (await listOrders()).filter((o: any) => o.status === 'IN_PRODUCTION');
  const todayChecks = await getTodayQcChecks();
  
  const phone = <QcGridScreen orders={orders as any[]} todayChecks={todayChecks as any[]} canWrite={canWrite} />;

  // D9 from 1024px up; the existing capture grid below it. ANY explicit `view` (`capture`, `classic`) is the
  // capture grid at every width — that is where a check is recorded, and D9 is the reading view of the shift.
  if (sp.view) return phone;

  // A second query on a page the phone also serves: a failure is LOGGED (never swallowed) and the desktop half says
  // it could not load, so the phone screen still renders.
  let grid: QcGridView | null = null;
  let denied = false;
  try {
    grid = await getQcHourlyGrid({ shiftId: sp.shift, date: sp.date });
  } catch (error) {
    // A refusal is not a failure: say "no access", not "could not load".
    if (isMisForbiddenError(error)) denied = true;
    else console.error('[mis-qc] the hourly grid failed to load', error);
  }

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <QcGridDesktop view={grid} denied={denied} />
      </div>
    </>
  );
}
