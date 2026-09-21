import { requireMisAccess } from '@/server/mis/guard';
import { listAttendance, getMonthSummary, listShifts } from '@/server/mis/attendance';
import { getAttendanceMonthView } from '@/server/mis/attendance-month';
import { AttendanceScreen } from '@/components/mis/attendance/attendance-screen';
import { AttendanceMonthDesktop } from '@/components/mis/desktop/attendance-month-desktop';
import { can } from '@/lib/mis/permissions';
import type { AttendanceMonthView } from '@/lib/mis/attendance-month';
import { getMisRole } from '@/server/mis/roles';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string; month?: string; dept?: string; emp?: string; day?: string }>;
}) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'attendance.write');
  const sp = await searchParams;
  // D8 is the reading view at `/mis/attendance` with no `view`. ANY explicit `view` — `classic`, or the register's
  // own `daily` / `monthly` tabs — is the register (clock-in, mark absent, edit) at every width, so its tabs
  // never throw a desktop user back to D8. On a phone the register is the only layout anyway.
  const view = !sp.view || sp.view === 'classic' ? 'daily' : sp.view;
  const date = sp.date;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [records, summary, shifts] = await Promise.all([
    view === 'daily' ? listAttendance(date) : [],
    view === 'monthly' ? getMonthSummary(year, month) : [],
    listShifts(),
  ]);
  const phone = <AttendanceScreen records={records} summary={summary} shifts={shifts} canWrite={canWrite} view={view} year={year} month={month} date={date} />;

  if (sp.view) return phone;

  // D8 from 1024px up. It is a second query on a page the phone also serves: a failure is LOGGED (never
  // swallowed) and the desktop half says it could not load, so the phone screen still renders.
  let matrix: AttendanceMonthView | null = null;
  try {
    matrix = await getAttendanceMonthView({ month: sp.month, departmentId: sp.dept, employeeId: sp.emp, day: sp.day });
  } catch (error) {
    console.error('[mis-attendance] the month matrix failed to load', error);
  }

  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <AttendanceMonthDesktop view={matrix} />
      </div>
    </>
  );
}
