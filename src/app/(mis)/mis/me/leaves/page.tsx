import { notFound } from 'next/navigation';

import { PageBack } from '@/components/mis/common/page-back';
import { MyLeaveScreen } from '@/components/mis/me/my-leave-screen';
import { listMyLeaves } from '@/server/mis/attendance';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisEmployee } from '@/server/mis/roles';

/** R2-220 — my leave: history, apply, withdraw a pending one. Reads are scoped to the caller's own employee row. */
export default async function MyLeavesPage() {
  const user = await requireMisAccess();
  const employee = await getMisEmployee(user.id);
  if (!employee) notFound();

  const rows = await listMyLeaves();

  return (
    <>
      <PageBack href="/mis/me" label="Me" />
      <MyLeaveScreen
        employeeId={employee.id}
        leaves={rows.map(({ id, date, endDate, leaveType, status, reason }) => ({ id, date, endDate, leaveType, status, reason }))}
      />
    </>
  );
}
