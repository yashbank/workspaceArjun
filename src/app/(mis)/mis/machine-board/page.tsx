import { MachineTimelineDesktop } from '@/components/mis/desktop/machine-timeline-desktop';
import { MachineBoardScreen } from '@/components/mis/machine-board/machine-board-screen';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { can } from '@/lib/mis/permissions';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { getMachineBoard, getMachineDayTimeline } from '@/server/mis/machines-board';
import { getMisRole } from '@/server/mis/roles';

/**
 * The machine board.
 *
 * TWO LAYOUTS, ONE PAGE (D1/D3/D5): the card grid (P1) below 1024px, and from there up the
 * desktop view with its Grid | Day timeline toggle. CSS alone decides which is on screen. The
 * timeline is dropped entirely on a phone rather than squeezed — nine hours in 360px is
 * unreadable at any density — and so is the toggle that offers it: absent, never disabled.
 * The same grid is the "Grid" half of the desktop toggle, so it is one component, not two.
 */
export default async function MachineBoardPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');

  const now = new Date();
  const [machines, timeline, timeZone] = await Promise.all([
    getMachineBoard(),
    getMachineDayTimeline(now),
    getFactoryTimezone(),
  ]);

  const grid = <MachineBoardScreen machines={machines} canWrite={canWrite} />;

  // "07/09": the shift's own day when there is one, otherwise the factory's today (D22).
  const key = timeline?.shift.dateKey ?? factoryDateKey(now, timeZone);
  const todayLabel = `${key.slice(8, 10)}/${key.slice(5, 7)}`;

  return (
    <>
      <div className="lg:hidden">{grid}</div>
      <div className="hidden lg:block">
        <MachineTimelineDesktop data={timeline} gridView={grid} todayLabel={todayLabel} />
      </div>
    </>
  );
}
