import { notFound } from 'next/navigation';

import { PageBack } from '@/components/mis/common/page-back';
import { MyRegularizationScreen } from '@/components/mis/me/my-regularization-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { listMyPunchRegularizations } from '@/server/mis/punch-regularization';
import { getMisEmployee } from '@/server/mis/roles';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { factoryDateKey } from '@/lib/mis/factory-time';

/** R2-222 - my missed-punch requests: raise one, see its status, withdraw a pending one. Own record only. */
export default async function MyRegularizationPage() {
  const user = await requireMisAccess();
  const employee = await getMisEmployee(user.id);
  if (!employee) notFound();

  const [rows, timeZone] = await Promise.all([listMyPunchRegularizations(), getFactoryTimezone()]);

  return (
    <>
      <PageBack href="/mis/me" label="Me" />
      <MyRegularizationScreen
        employeeId={employee.id}
        todayKey={factoryDateKey(new Date(), timeZone)}
        timeZone={timeZone}
        rows={rows.map(({ id, workDate, requestedIn, requestedOut, reason, status, decisionNote }) => ({ id, workDate, requestedIn, requestedOut, reason, status, decisionNote }))}
      />
    </>
  );
}
