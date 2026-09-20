import { resolveAsOf } from '@/lib/mis/effective-dated';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getWageRuleHistory } from '@/server/mis/business-rules';
import { DEFAULT_DAILY_WAGE_CODE, getWageRateHistory } from '@/server/mis/wage-type';

/** Attendance statuses that earn a day's basic wage, and what fraction of it. */
const DAY_FRACTION: Record<string, number> = { PRESENT: 1, HALF_DAY: 0.5 };

/**
 * Every payslip figure — basic pay, overtime pay, late penalty, gross pay — is a wage, so the
 * gate is `wages.read` (Owner only, S9 / D24). It used to be `attendance.read`, the permission
 * of the screen that happened to call it, which four non-Owner roles hold (F-01).
 *
 * RATES ARE READ AS OF EACH DAY, NOT AS OF NOW (F-08, MIS-272, D27). Every rate is effective-
 * dated and never edited in place, so each attendance day is priced at the rate in force on that
 * day's own date. A rate that takes effect today therefore cannot change last month's payslip, and
 * a rate that takes effect mid-month splits the month at that date. Before 14F this read every rate
 * "as of now", so adding a rate moved every closed month.
 *
 * The month is a run of DATE values (`@db.Date`, UTC midnight), so its bounds are built in UTC — a
 * server-local `new Date(year, month, 0)` would drop the last day of the month on any server east
 * of Greenwich (D22; one of the Phase 13 sweep sites).
 */
export async function calculateMonthlyPayroll(year: number, month: number) {
  await requirePermission('wages.read');

  // Effective-dated histories, fetched once — not one query per day.
  const [wageTypeHistory, dailyRule, otRule, lateRule] = await Promise.all([
    getWageRateHistory(DEFAULT_DAILY_WAGE_CODE),
    getWageRuleHistory('DAILY_WAGE_DEFAULT'),
    getWageRuleHistory('OT_MULTIPLIER'),
    getWageRuleHistory('LATE_PENALTY_PER_MIN'),
  ]);

  // MIS-44: the wage-type master takes over from the day the Owner creates WG-DAILY-01. Before that
  // day the flat business rule applies, so no earlier figure moves the day the master is introduced.
  const dailyWageOn = (date: Date): number => {
    const fromType = resolveAsOf(wageTypeHistory, date);
    if (fromType) return fromType.amount;
    return parseFloat(resolveAsOf(dailyRule, date)?.ruleValue ?? '500');
  };
  const otMultiplierOn = (date: Date): number => parseFloat(resolveAsOf(otRule, date)?.ruleValue ?? '1.5');
  const latePenaltyOn = (date: Date): number => parseFloat(resolveAsOf(lateRule, date)?.ruleValue ?? '0');

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const workingDays = end.getUTCDate();

  const attendance = await db.misAttendance.findMany({
    where: { date: { gte: start, lte: end } },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true } },
      shift: { select: { name: true } },
    },
    orderBy: [{ employee: { name: 'asc' } }, { date: 'asc' }],
  });

  // Group by employee
  const byEmployee: Record<string, typeof attendance> = {};
  for (const a of attendance) {
    const empId = a.employee?.id ?? 'unknown';
    if (!byEmployee[empId]) byEmployee[empId] = [];
    byEmployee[empId].push(a);
  }

  return Object.values(byEmployee).map((records) => {
    const emp = records[0].employee;
    const present = records.filter(r => ['PRESENT', 'HALF_DAY'].includes(r.status)).length;
    const halfDay = records.filter(r => r.status === 'HALF_DAY').length;
    const absent = records.filter(r => r.status === 'ABSENT').length;
    const leave = records.filter(r => r.status === 'LEAVE').length;
    const totalLateMinutes = records.reduce((s, r) => s + (r.lateMinutes ?? 0), 0);
    const totalOTMinutes = records.reduce((s, r) => s + (r.otMinutes ?? 0), 0);

    // Each day at its own day's rate: full present = 1 day, half day = 0.5.
    let basicWage = 0;
    let otPay = 0;
    let latePenaltyTotal = 0;
    for (const r of records) {
      const dailyWage = dailyWageOn(r.date);
      basicWage += (DAY_FRACTION[r.status] ?? 0) * dailyWage;
      otPay += ((r.otMinutes ?? 0) / 60) * (dailyWage / 8) * otMultiplierOn(r.date);
      latePenaltyTotal += (r.lateMinutes ?? 0) * latePenaltyOn(r.date);
    }
    const grossPay = basicWage + otPay - latePenaltyTotal;

    return {
      employeeId: emp?.id ?? '',
      employeeName: emp?.name ?? '—',
      employeeCode: emp?.employeeCode ?? '—',
      workingDays,
      present,
      absent,
      leave,
      halfDay,
      totalLateMinutes,
      totalOTMinutes,
      basicWage: Math.round(basicWage),
      otPay: Math.round(otPay),
      latePenalty: Math.round(latePenaltyTotal),
      grossPay: Math.round(grossPay),
    };
  });
}

export type MonthWageBill = {
  year: number;
  month: number;
  headcount: number;
  gross: number;
  basic: number;
  ot: number;
};

/**
 * The month-to-date wage bill, for the one card that carries money.
 *
 * Gated on 'wages.read', which the matrix grants to OWNER alone — so this can
 * never be called into by an admin page that grew a wage figure by accident.
 */
export async function getMonthWageBill(year: number, month: number): Promise<MonthWageBill> {
  await requirePermission('wages.read');
  const rows = await calculateMonthlyPayroll(year, month);
  return {
    year,
    month,
    headcount: rows.length,
    gross: rows.reduce((s, r) => s + r.grossPay, 0),
    basic: rows.reduce((s, r) => s + r.basicWage, 0),
    ot: rows.reduce((s, r) => s + r.otPay, 0),
  };
}
