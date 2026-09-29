import { EmptyState } from '@/components/mis/kit/empty-state';
import { KioskScreen } from '@/components/mis/kiosk/kiosk-screen';
import { factoryDateKey, previousDateKey } from '@/lib/mis/factory-time';
import { listAttendance, listShifts } from '@/server/mis/attendance';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { listEmployeeRoster } from '@/server/mis/employee';
import { requireMisAccess } from '@/server/mis/guard';

export default async function KioskPage() {
  // Left outside the try below on purpose: a Forbidden/Unauthorized here must keep
  // reaching mis/error.tsx's own boundary, not fall into the generic retry state.
  const user = await requireMisAccess();
  // "Today" is the factory's today (D22), not the server's.
  const timeZone = await getFactoryTimezone();
  const now = new Date();
  const today = factoryDateKey(now, timeZone);
  // A night shift wrapping midnight keeps its early-morning punches on the PREVIOUS
  // work-date (workDateFor, attendance-day.ts) — so someone who clocked in at 00:30
  // is invisible here if this screen only ever asks for "today". Pull yesterday too
  // and let anyone still clocked in from it take priority below.
  const yesterday = previousDateKey(today);

  let employees, shifts, todayAttendance, yesterdayAttendance;
  try {
    [employees, shifts, todayAttendance, yesterdayAttendance] = await Promise.all([
      listEmployeeRoster(),
      listShifts(),
      listAttendance(today),
      listAttendance(yesterday),
    ]);
  } catch {
    // A transient DB/network hiccup on this data load must never surface as a raw
    // crash page — a factory-floor screen has to fail as "try again", not a stack trace.
    return (
      <div className="mx-auto max-w-md py-12">
        <EmptyState
          title="Couldn't load the kiosk screen"
          body="This is usually a brief hiccup — try again in a moment."
          action={
            <a
              href="/mis/kiosk"
              className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
            >
              Try again
            </a>
          }
        />
      </div>
    );
  }

  // Build a map of employeeId -> current attendance record. Today's row wins by
  // default; yesterday's overrides it ONLY while still open (clocked in, not out) —
  // that person is still on shift regardless of which calendar date rolled over
  // underneath them. Yesterday's row is used as a fallback (last known state) only
  // when there is no row for today at all.
  const attendanceMap: Record<string, { id: string; clockIn: Date | null; clockOut: Date | null; status: string }> = {};
  for (const a of todayAttendance) {
    attendanceMap[a.employeeId] = { id: a.id, clockIn: a.clockIn, clockOut: a.clockOut, status: a.status };
  }
  for (const a of yesterdayAttendance) {
    const stillOpen = a.clockIn && !a.clockOut;
    if (stillOpen || !attendanceMap[a.employeeId]) {
      attendanceMap[a.employeeId] = { id: a.id, clockIn: a.clockIn, clockOut: a.clockOut, status: a.status };
    }
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
