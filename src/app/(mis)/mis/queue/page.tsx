import { notFound } from 'next/navigation';

import { can } from '@/lib/mis/permissions';
import { ParkedWritesScreen } from '@/components/mis/queue/parked-writes-screen';
import { getClearanceStatus } from '@/server/mis/line-clearance';
import { requireMisAccess } from '@/server/mis/guard';
import { listParkedWrites } from '@/server/mis/idempotency';
import { getMisRole } from '@/server/mis/roles';

/**
 * Phase 23 — the parked-writes inbox (Appendix B §B.7). `queue.review` (OWNER, ADMIN,
 * SUPER_ATTENDANCE_OPERATOR) or the page is absent, matching D30's own "absent, not
 * refused on open" precedent. `listParkedWrites` itself already narrows which ROWS a
 * caller sees by their own domain read permission (D-guide's own F-13 warning) — this
 * page only decides whether the door opens at all.
 */
export default async function QueuePage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'queue.review')) notFound();

  const rows = await listParkedWrites();

  // §B.5.1: a clearance park shows the clearance in force NOW beside `parkDetail`'s own
  // account of the one in force when it was tapped. `getClearanceStatus` has no permission
  // gate of its own (read-only, no money) — only the override action needs `clearance.write`.
  const clearanceNow: Record<string, boolean> = {};
  for (const row of rows) {
    if (row.parkReason !== 'CLEARANCE_EXPIRED' && row.parkReason !== 'CLEARANCE_MISSING') continue;
    const machineId = (row.payload as { machineId?: unknown } | null)?.machineId;
    if (typeof machineId === 'string') {
      clearanceNow[row.key] = (await getClearanceStatus(machineId)).cleared;
    }
  }

  return (
    <ParkedWritesScreen
      rows={rows}
      clearanceNow={clearanceNow}
      canClearanceOverride={can(role, 'clearance.write')}
      canAttendanceOverride={can(role, 'attendance.write')}
    />
  );
}
