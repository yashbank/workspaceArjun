import { QcScreen } from '@/components/mis/qc/qc-screen';
import { DefectsDesktop } from '@/components/mis/desktop/defects-desktop';
import type { DefectReportView } from '@/lib/mis/defects';
import { can } from '@/lib/mis/permissions';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getDefectReport } from '@/server/mis/defects';
import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';

export default async function DefectsPage({ searchParams }: { searchParams: Promise<{ month?: string; machine?: string; severity?: string }> }) {
  const sp = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);

  // Defects & rework is a desktop reading screen with no phone twin; below 1024px the quality screen (the phone
  // layer's own) is what a phone shows. Two layouts, chosen in CSS only.
  const orders = (await listOrders()).filter((o: { status: string }) => !['CANCELLED', 'DELIVERED'].includes(o.status));
  const phone = <QcScreen orders={orders} canWrite={can(role, 'qc.write')} />;

  // A second query on a page the phone also serves: a failure is LOGGED (never swallowed) and the desktop half
  // says so, so the phone screen still renders. A refusal is "no access", not "could not load".
  let report: DefectReportView | null = null;
  let denied = false;
  try {
    report = await getDefectReport({ month: sp.month, machine: sp.machine, severity: sp.severity });
  } catch (error) {
    if (isMisForbiddenError(error)) denied = true;
    else console.error('[mis-qc] the defects report failed to load', error);
  }

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <DefectsDesktop view={report} denied={denied} />
      </div>
    </>
  );
}
