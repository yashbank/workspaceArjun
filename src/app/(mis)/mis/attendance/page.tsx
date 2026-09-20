import { requireMisAccess } from '@/server/mis/guard';
import { listAttendance, getMonthSummary, listShifts } from '@/server/mis/attendance';
import { AttendanceScreen } from '@/components/mis/attendance/attendance-screen';
import { can } from '@/lib/mis/permissions';
import { getMisRole } from '@/server/mis/roles';

export default async function AttendancePage({ searchParams }: { searchParams: { date?: string; view?: string } }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'attendance.write');
  const view = (await searchParams).view ?? 'daily';
  const date = (await searchParams).date;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [records, summary, shifts] = await Promise.all([
    view === 'daily' ? listAttendance(date) : [],
    view === 'monthly' ? getMonthSummary(year, month) : [],
    listShifts(),
  ]);
  return <AttendanceScreen records={records} summary={summary} shifts={shifts} canWrite={canWrite} view={view} year={year} month={month} date={date} />;
}
