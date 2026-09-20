import { KioskScreen } from '@/components/mis/kiosk/kiosk-screen';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { listAttendance, listShifts } from '@/server/mis/attendance';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { listEmployeeRoster } from '@/server/mis/employee';
import { requireMisAccess } from '@/server/mis/guard';

export default async function KioskPage() {
  const user = await requireMisAccess();
  // "Today" is the factory's today (D22), not the server's.
  const timeZone = await getFactoryTimezone();
  const now = new Date();
  const today = factoryDateKey(now, timeZone);
  const [employees, shifts, todayAttendance] = await Promise.all([
    listEmployeeRoster(),
    listShifts(),
    listAttendance(today),
  ]);

  // Build a map of employeeId -> attendance record for today
  const attendanceMap: Record<string, { id: string; clockIn: Date | null; clockOut: Date | null; status: string }> = {};
  for (const a of todayAttendance) {
    attendanceMap[a.employeeId] = { id: a.id, clockIn: a.clockIn, clockOut: a.clockOut, status: a.status };
  }

  const employeesWithStatus = employees
    .filter((e) => e.isActive)
    .map((e) => ({
      id: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
      role: e.role,
      attendance: attendanceMap[e.id] ?? null,
    }));

  return (
    <KioskScreen
      employees={employeesWithStatus}
      shifts={shifts.map((s) => ({ id: s.id, name: s.name }))}
      date={today}
      userId={user.id}
      timeZone={timeZone}
      loadedAt={now.toISOString()}
    />
  );
}
