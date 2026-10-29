import { PageBack } from '@/components/mis/common/page-back';
import { RegularizationReviewScreen } from '@/components/mis/attendance/regularization-review-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { listPunchRegularizations } from '@/server/mis/punch-regularization';

/** R2-222 - the review queue for missed-punch requests (Supervisor, Admin, Owner). */
export default async function RegularizationPage() {
  await requireMisAccess();
  const [rows, timeZone] = await Promise.all([listPunchRegularizations('PENDING'), getFactoryTimezone()]);

  return (
    <>
      <PageBack href="/mis/attendance" label="Attendance" />
      <RegularizationReviewScreen
        timeZone={timeZone}
        rows={rows.map((r) => ({
          id: r.id, workDate: r.workDate, requestedIn: r.requestedIn, requestedOut: r.requestedOut, reason: r.reason,
          employee: { name: r.employee.name, employeeCode: r.employee.employeeCode },
        }))}
      />
    </>
  );
}
