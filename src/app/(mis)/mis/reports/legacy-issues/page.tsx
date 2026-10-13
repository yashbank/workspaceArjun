import { can } from '@/lib/mis/permissions';
import { LegacyIssuesScreen } from '@/components/mis/reports/legacy-issues-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listLegacyStoreIssues } from '@/server/mis/legacy-issues';
import { getMisRole } from '@/server/mis/roles';

/** R3-QCR B83: read-only list of store issues never linked to an order. Needs reports.read AND inventory.read. */
export default async function LegacyIssuesPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'reports.read') || !can(role, 'inventory.read')) {
    return <div className="p-8 text-slate-500">You don&apos;t have access to this report.</div>;
  }
  const rows = await listLegacyStoreIssues();
  return <LegacyIssuesScreen rows={rows} />;
}
