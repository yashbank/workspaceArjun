/**
 * Phase 5 go-live: wipe ONLY kiosk-side test data. DRY RUN by default.
 *
 *   pnpm golive:wipe                                  # dry run, row counts only
 *   CONFIRM_WIPE=1 pnpm golive:wipe -- --execute      # real run, one transaction
 *
 * WIPES: punches (TRUNCATE; immutability trigger), breaks, punch regularizations, attendance, leave,
 *   extra-pay days, payroll snapshot lines/periods, payslip releases, salary advances (of wiped employees),
 *   shift handovers, queued attendance writes (kind attendance.punch_in/out only), and test MisEmployee rows
 *   (cascading: shift roster, pay components) EXCEPT the protected ones below.
 * KEEPS: all UserProfile/auth/roles/permissions, settings/business rules, wage types, leave-pay rules,
 *   MisShift/MisDepartment masters, kiosk devices, and everything in orders/store/production/QC/BOM/PO/GRN.
 * PROTECTED employees (never deleted, logged): userProfileId set; or referenced by MisWorkerAllocation,
 *   MisProductionLog, MisJobPhase.inCharge (non-kiosk modules). Attendance of protected employees is still
 *   wiped (it is test attendance); their rows survive.
 * Gate: DB project ref must match (see _gate.ts); real run needs CONFIRM_WIPE=1 AND --execute.
 */
import { openDb } from './_gate';

async function main() {
  const { prisma, execute } = openDb();

  const emps = await prisma.misEmployee.findMany({ select: { id: true, employeeCode: true, name: true, userProfileId: true } });
  const [alloc, prodLog, phase] = await Promise.all([
    prisma.misWorkerAllocation.findMany({ select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.misProductionLog.findMany({ where: { employeeId: { not: null } }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.misJobPhase.findMany({ where: { inChargeEmployeeId: { not: null } }, select: { inChargeEmployeeId: true }, distinct: ['inChargeEmployeeId'] }),
  ]);
  const byAlloc = new Set(alloc.map((a) => a.employeeId));
  const byLog = new Set(prodLog.map((a) => a.employeeId!));
  const byPhase = new Set(phase.map((a) => a.inChargeEmployeeId!));

  const protectedRows: { code: string; name: string; why: string[] }[] = [];
  const deletable: string[] = [];
  for (const e of emps) {
    const why: string[] = [];
    if (e.userProfileId) why.push('linked to user account');
    if (byAlloc.has(e.id)) why.push('worker allocation (production)');
    if (byLog.has(e.id)) why.push('production log');
    if (byPhase.has(e.id)) why.push('job phase in-charge (production)');
    if (why.length) protectedRows.push({ code: e.employeeCode, name: e.name, why });
    else deletable.push(e.id);
  }

  const inIds = { in: deletable };
  const counts = {
    'attendance punches (TRUNCATE)': await prisma.misAttendancePunch.count(),
    'attendance breaks': await prisma.misAttendanceBreak.count(),
    'punch regularizations': await prisma.misPunchRegularization.count(),
    attendance: await prisma.misAttendance.count(),
    'leave requests': await prisma.misLeaveRequest.count(),
    'extra-pay-day employees': await prisma.misExtraPayDayEmployee.count(),
    'extra-pay-day departments': await prisma.misExtraPayDayDepartment.count(),
    'extra-pay days': await prisma.misExtraPayDay.count(),
    'payroll snapshot lines': await prisma.misPayrollSnapshotLine.count(),
    'payroll periods': await prisma.misPayrollPeriod.count(),
    'payslip releases': await prisma.misPayslipRelease.count(),
    'shift handovers': await prisma.misShiftHandover.count(),
    'queued writes (attendance.punch_in/out)': await prisma.misQueuedWrite.count({ where: { kind: { in: ['attendance.punch_in', 'attendance.punch_out'] } } }),
    'salary advances (of deletable employees)': await prisma.misSalaryAdvance.count({ where: { employeeId: inIds } }),
    'shift roster rows (cascade, deletable employees)': await prisma.misShiftRoster.count({ where: { employeeId: inIds } }),
    'pay components (cascade, deletable employees)': await prisma.misEmployeePayComponent.count({ where: { employeeId: inIds } }),
    'EMPLOYEES deleted': deletable.length,
  };
  const keep = {
    'user profiles': await prisma.userProfile.count(),
    shifts: await prisma.misShift.count(),
    departments: await prisma.misDepartment.count(),
    'kiosk devices': await prisma.misKioskDevice.count(),
    'employees total': emps.length,
    'employees protected (kept)': protectedRows.length,
    'employees linked to a user': emps.filter((e) => e.userProfileId).length,
  };
  console.log(execute ? 'Will delete:' : 'WOULD delete:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(52)} ${v}`);
  console.log('Kept (not touched):');
  for (const [k, v] of Object.entries(keep)) console.log(`  ${k.padEnd(52)} ${v}`);
  console.log(`Protected employees (${protectedRows.length}):`);
  for (const p of protectedRows) console.log(`  ${p.code} ${p.name} - ${p.why.join(', ')}`);

  if (!execute) {
    console.log('\nDRY RUN only. Nothing changed.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // TRUNCATE (not DELETE): the immutability trigger refuses row deletes (see prisma/reset-mis-attendance-data.ts).
      await tx.$executeRawUnsafe('TRUNCATE TABLE mis_attendance_punches');
      await tx.misAttendanceBreak.deleteMany();
      await tx.misPunchRegularization.deleteMany();
      await tx.misAttendance.deleteMany();
      await tx.misLeaveRequest.deleteMany();
      await tx.misExtraPayDayEmployee.deleteMany();
      await tx.misExtraPayDayDepartment.deleteMany();
      await tx.misExtraPayDay.deleteMany();
      await tx.misPayrollSnapshotLine.deleteMany();
      await tx.misPayrollPeriod.deleteMany();
      await tx.misPayslipRelease.deleteMany();
      await tx.misShiftHandover.deleteMany();
      await tx.misQueuedWrite.deleteMany({ where: { kind: { in: ['attendance.punch_in', 'attendance.punch_out'] } } });
      await tx.misSalaryAdvance.deleteMany({ where: { employeeId: inIds } });
      await tx.misShiftRoster.deleteMany({ where: { employeeId: inIds } });
      await tx.misEmployeePayComponent.deleteMany({ where: { employeeId: inIds } });
      // Re-point reports of deleted managers explicitly (FK is SetNull anyway).
      await tx.misEmployee.updateMany({ where: { managerId: inIds, id: { notIn: deletable } }, data: { managerId: null } });
      const del = await tx.misEmployee.deleteMany({ where: { id: inIds } });
      console.log(`\nCOMMITTING: employees deleted ${del.count}`);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
  console.log('Kiosk test-data wipe complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
