/**
 * MIS test/attendance data reset — a SEPARATE concern from `reset-production-workspace.ts`
 * (which only clears FILE/DOCUMENT storage and never touches MIS tables; do not merge the two).
 *
 * Usage:
 *   CONFIRM_RESET_MIS_ATTENDANCE=true pnpm mis:reset-attendance
 *
 * DELETES (test/transactional data, safe to wipe pre-go-live): MisAttendancePunch (TRUNCATEd, not
 * DELETEd — see note below), MisAttendance, MisLeaveRequest, MisExtraPayDayEmployee,
 * MisExtraPayDayDepartment, MisExtraPayDay, MisPayrollSnapshotLine, MisPayrollPeriod,
 * MisPayslipRelease, MisShiftHandover, and only the attendance.punch_in/out rows of
 * MisQueuedWrite (that table is shared with production.log/waste_reason — those are left alone).
 *
 * PRESERVES (masters/config, must survive a reset): MisEmployee, MisShift, MisWageType,
 * MisEmployeePayComponent, MisLeavePayRule (R2-102 leave-pay settings), MisKioskDevice (the
 * paired tablets themselves — only their punch HISTORY is wiped), MisDepartment, and every
 * user/role row (UserProfile, auth).
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.CONFIRM_RESET_MIS_ATTENDANCE !== 'true') {
  console.error(
    'Refusing to run: set CONFIRM_RESET_MIS_ATTENDANCE=true to confirm the MIS attendance/payroll data reset.',
  );
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';
const isRemote =
  !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== MIS attendance/test data reset ===\n');

  const employeeCount = await prisma.misEmployee.count();
  const shiftCount = await prisma.misShift.count();
  console.log(`Preserving ${employeeCount} employee(s) and ${shiftCount} shift(s) (masters are not touched).\n`);

  // mis_attendance_punches carries a DB trigger that refuses UPDATE and DELETE on every row
  // (migration 20260925000000_mis_attendance_punches, K2: "punches are never overwritten in
  // place"). TRUNCATE is a whole-table operation, not a row DELETE, so the trigger — deliberately
  // written to allow exactly this — does not fire. A plain `deleteMany()` here would raise
  // `mis_attendance_punch_immutable` and abort the whole script.
  const punchCountBefore = await prisma.misAttendancePunch.count();
  await prisma.$executeRawUnsafe('TRUNCATE TABLE mis_attendance_punches');

  // Children before parents, even where there is no enforced FK (several of these are soft,
  // unconstrained uuid references, per this schema's convention) — so a row is never left
  // pointing at a parent that reset has already removed.
  const attendanceDeleted = await prisma.misAttendance.deleteMany();
  const leaveDeleted = await prisma.misLeaveRequest.deleteMany();
  const extraPayEmployeeDeleted = await prisma.misExtraPayDayEmployee.deleteMany();
  const extraPayDepartmentDeleted = await prisma.misExtraPayDayDepartment.deleteMany();
  const extraPayDayDeleted = await prisma.misExtraPayDay.deleteMany();
  const payrollLineDeleted = await prisma.misPayrollSnapshotLine.deleteMany();
  const payrollPeriodDeleted = await prisma.misPayrollPeriod.deleteMany();
  const payslipReleaseDeleted = await prisma.misPayslipRelease.deleteMany();
  const shiftHandoverDeleted = await prisma.misShiftHandover.deleteMany();
  // mis_queued_writes is SHARED with production (`production.log`, `production.waste_reason` —
  // see QUEUEABLE_KINDS in src/lib/mis/offline/idempotency.ts): an unscoped deleteMany() here
  // would also destroy pending production-floor offline writes that have nothing to do with
  // attendance. Scoped to the two punch kinds only.
  const queuedWriteDeleted = await prisma.misQueuedWrite.deleteMany({
    where: { kind: { in: ['attendance.punch_in', 'attendance.punch_out'] } },
  });

  console.log('=== Summary ===');
  console.log(`  Deleted attendance punches:        ${punchCountBefore} (TRUNCATE)`);
  console.log(`  Deleted attendance days:           ${attendanceDeleted.count}`);
  console.log(`  Deleted leave requests:             ${leaveDeleted.count}`);
  console.log(`  Deleted extra-pay-day employees:    ${extraPayEmployeeDeleted.count}`);
  console.log(`  Deleted extra-pay-day departments:  ${extraPayDepartmentDeleted.count}`);
  console.log(`  Deleted extra pay days:             ${extraPayDayDeleted.count}`);
  console.log(`  Deleted payroll snapshot lines:     ${payrollLineDeleted.count}`);
  console.log(`  Deleted payroll periods:            ${payrollPeriodDeleted.count}`);
  console.log(`  Deleted payslip releases:           ${payslipReleaseDeleted.count}`);
  console.log(`  Deleted shift handovers:            ${shiftHandoverDeleted.count}`);
  console.log(`  Deleted queued writes:              ${queuedWriteDeleted.count}`);
  console.log(`  Employees preserved:                ${employeeCount}`);
  console.log(`  Shifts preserved:                   ${shiftCount}`);
  console.log(`  Wage types, pay components, leave-pay rules, kiosk devices, departments: preserved`);
  console.log('\nMIS attendance/test data reset complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
