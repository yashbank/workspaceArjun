import { resolveAsOf } from '@/lib/mis/effective-dated';
import { daysInMonth, extraPayMultiplierUnit, isSunday, otPayForDay, perDayRate, type WageRowForCalc } from '@/lib/mis/pay-basis';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getWageRuleHistory } from '@/server/mis/business-rules';
import { DEFAULT_DAILY_WAGE_CODE, getWageTypeRowsForCodes } from '@/server/mis/wage-type';
import { getPayComponentsForEmployees, type PayComponentMap } from '@/server/mis/pay-components';
import { listApprovedExtraPayDaysForMonth, type ExtraPayDayRow } from '@/server/mis/extra-pay-days';

/** Attendance statuses that earn a day's basic wage, and what fraction of it. */
const DAY_FRACTION: Record<string, number> = { PRESENT: 1, HALF_DAY: 0.5 };

export type PayrollRow = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  payType: 'MONTHLY' | 'DAILY';
  workingDays: number;
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  totalLateMinutes: number;
  totalOTMinutes: number;
  allowanceDays: number;
  basicWage: number;
  hra: number;
  allowance: number;
  otPay: number;
  bonus: number;
  extraPay: number;
  latePenalty: number;
  grossPay: number;
  wageTypeCode: string | null;
  /** Set on a live (OPEN period) row when no wage code could be resolved at all — 25.1's data-health finding. */
  needsPayCode?: boolean;
};

type AttendanceRow = {
  id: string;
  date: Date;
  status: string;
  lateMinutes: number | null;
  otMinutes: number | null;
  employee: {
    id: string;
    name: string;
    employeeCode: string;
    payType?: 'MONTHLY' | 'DAILY' | null;
    sundayPaid?: boolean | null;
    wageTypeCode?: string | null;
  } | null;
};

function round(n: number): number {
  return Math.round(n);
}

/** A snapshot line, read back in the same shape `calculateMonthlyPayroll` returns live. */
function snapshotToRow(line: {
  employeeId: string; employeeCode: string; employeeName: string; payType: 'MONTHLY' | 'DAILY';
  workingDays: number; present: number; halfDay: number; absent: number; leave: number;
  otMinutes: number; lateMinutes: number; allowanceDays: number;
  basicWage: unknown; hra: unknown; allowance: unknown; otPay: unknown; bonus: unknown; extraPay: unknown; latePenalty: unknown; grossPay: unknown;
  wageTypeCode: string | null;
}): PayrollRow {
  const n = (v: unknown) => Number(v);
  return {
    employeeId: line.employeeId,
    employeeName: line.employeeName,
    employeeCode: line.employeeCode,
    payType: line.payType,
    workingDays: line.workingDays,
    present: line.present,
    absent: line.absent,
    leave: line.leave,
    halfDay: line.halfDay,
    totalLateMinutes: line.lateMinutes,
    totalOTMinutes: line.otMinutes,
    allowanceDays: line.allowanceDays,
    basicWage: n(line.basicWage),
    hra: n(line.hra),
    allowance: n(line.allowance),
    otPay: n(line.otPay),
    bonus: n(line.bonus),
    extraPay: n(line.extraPay),
    latePenalty: n(line.latePenalty),
    grossPay: n(line.grossPay),
    wageTypeCode: line.wageTypeCode,
  };
}

/**
 * One employee's whole month, live — the day-by-day loop 25.1–25.5 extend.
 *
 * Every rate is read AS OF EACH DAY (F-08, D27): `resolveAsOf` on the employee's own wage-code
 * history, never "as of now". HRA/Allowance/Bonus are monthly entitlements on the code, not
 * day-priced, so they are resolved once as of the period's LAST day (the figure the month will
 * actually close on) rather than per attendance day.
 */
function computeEmployeeMonth(
  records: AttendanceRow[],
  year: number,
  month: number,
  wageHistory: (WageRowForCalc & { effectiveFrom: Date })[] | undefined,
  otMultiplierOn: (date: Date) => number,
  latePenaltyOn: (date: Date) => number,
  fallbackDailyWageOn: (date: Date) => number,
  components: PayComponentMap,
  extraPayDays: ExtraPayDayRow[],
  workingDays: number,
): PayrollRow {
  const emp = records[0].employee!;
  const payType: 'MONTHLY' | 'DAILY' = emp.payType === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const rowOn = (date: Date) => (wageHistory ? resolveAsOf(wageHistory, date) : null);
  const dayRateOn = (date: Date) => {
    const row = rowOn(date);
    return row ? perDayRate(row, fallbackDailyWageOn(date), year, month) : fallbackDailyWageOn(date);
  };

  const seenDates = new Set(records.map((r) => r.date.toISOString().slice(0, 10)));

  let present = 0, halfDay = 0, absent = 0, leave = 0, allowanceDays = 0;
  let totalLateMinutes = 0, totalOTMinutes = 0;
  let basicWage = 0, otPay = 0, latePenaltyTotal = 0;

  const priceDay = (date: Date, status: string, lateMinutes: number, otMinutes: number, synthetic: boolean) => {
    const monthlySunday = payType === 'MONTHLY' && isSunday(date);
    const fraction = monthlySunday ? 1 : (DAY_FRACTION[status] ?? 0);
    const dayRate = dayRateOn(date);
    const row = rowOn(date);

    if (monthlySunday) allowanceDays += 1;
    if (!synthetic) {
      // "present" counts both a full PRESENT day and a HALF_DAY (the original shape) — a
      // monthly-employee's paid-but-unmarked Sunday is not folded into it, since it is a pay
      // POLICY, not an attendance fact; the same is true of `absent`/`leave` below.
      if (status === 'PRESENT' || status === 'HALF_DAY') present += 1;
      if (status === 'HALF_DAY') halfDay += 1;
      if (status === 'ABSENT') absent += 1;
      if (status === 'LEAVE') leave += 1;
      totalLateMinutes += lateMinutes;
      totalOTMinutes += otMinutes;
      latePenaltyTotal += lateMinutes * latePenaltyOn(date);
      otPay += otPayForDay(otMinutes, dayRate, row?.otRatePerHour ?? null, otMultiplierOn(date));
    }
    basicWage += fraction * dayRate;
  };

  for (const r of records) {
    priceDay(r.date, r.status, r.lateMinutes ?? 0, r.otMinutes ?? 0, false);
  }

  // 25.3: a MONTHLY employee is paid every Sunday, including one with no attendance row at all
  // (the normal case — nobody clocks in on a day off). A Sunday that DOES have a row was already
  // priced as a paid Sunday above (`monthlySunday` overrides its own status); this only fills the
  // gap for Sundays no row exists for.
  if (payType === 'MONTHLY') {
    for (let d = 1; d <= workingDays; d++) {
      const date = new Date(Date.UTC(year, month - 1, d));
      if (isSunday(date) && !seenDates.has(date.toISOString().slice(0, 10))) {
        priceDay(date, 'PRESENT', 0, 0, true);
      }
    }
  }

  // 25.1: HRA/Allowance/Bonus are monthly entitlements on the wage code, not day-priced — resolved
  // once, as of the period's own last day, and zeroed by the per-employee toggle when off.
  const closingRow = rowOn(monthEnd);
  const hra = components.HRA && closingRow?.hraAmount ? closingRow.hraAmount : 0;
  const allowance = components.ALLOWANCE && closingRow?.allowanceAmount ? closingRow.allowanceAmount : 0;
  const bonus = components.BONUS && closingRow?.bonusAmount ? closingRow.bonusAmount : 0;

  // 25.4/25.5: approved extra-pay days touching this employee (by scope), additive with OT —
  // deliberately a separate accumulator so a day with both never lets one silently absorb the other.
  let extraPay = 0;
  for (const day of extraPayDays) {
    const inScope =
      day.scope === 'ALL_PRESENT'
        ? records.some((r) => r.date.getTime() === day.date.getTime() && DAY_FRACTION[r.status] > 0)
        : day.scope === 'EMPLOYEES'
          ? day.employeeIds.includes(emp.id)
          : false; // DEPARTMENTS scope needs the employee's department, resolved by the caller (see note below)
    if (!inScope) continue;
    const row = rowOn(day.date);
    const dayRate = dayRateOn(day.date);
    if (day.kind === 'FLAT_AMOUNT') extraPay += day.value;
    else extraPay += day.value * extraPayMultiplierUnit(payType, dayRate, row?.multiplierBasis ?? 'PER_MONTH');
  }

  const basicWageOn = components.BASIC ? basicWage : 0;
  const otPayOn = components.OT ? otPay : 0;
  const grossPay = basicWageOn + otPayOn + hra + allowance + bonus + extraPay - latePenaltyTotal;

  return {
    employeeId: emp.id,
    employeeName: emp.name,
    employeeCode: emp.employeeCode,
    payType,
    workingDays,
    present,
    absent,
    leave,
    halfDay,
    totalLateMinutes,
    totalOTMinutes,
    allowanceDays,
    basicWage: round(basicWageOn),
    hra: round(hra),
    allowance: round(allowance),
    otPay: round(otPayOn),
    bonus: round(bonus),
    extraPay: round(extraPay),
    latePenalty: round(latePenaltyTotal),
    grossPay: round(grossPay),
    wageTypeCode: emp.wageTypeCode ?? null,
    needsPayCode: !emp.wageTypeCode && !closingRow,
  };
}

/**
 * Every payslip figure — basic pay, HRA, allowance, OT pay, bonus, extra pay, late penalty, gross
 * pay — is a wage, so the gate is `wages.read` (Owner only, S9 / D24). It used to be
 * `attendance.read`, the permission of the screen that happened to call it, which four non-Owner
 * roles hold (F-01).
 *
 * CLOSED month (D27, Phase 25): once `MisPayrollPeriod.status` is CLOSED, this reads the frozen
 * `MisPayrollSnapshotLine` rows instead of recomputing — a rate back-dated into a closed month can
 * no longer move it. OPEN (the default until Phase 25's close flow runs) computes live, as before,
 * now per-employee: each employee prices at THEIR OWN wage code (`wageTypeCode`), falling back to
 * the historic global default (`DEFAULT_DAILY_WAGE_CODE`) or the `DAILY_WAGE_DEFAULT` business
 * rule for anyone with no code set — the pre-Phase-25 behaviour, unchanged, for an employee this
 * phase has not touched.
 *
 * The month is a run of DATE values (`@db.Date`, UTC midnight), so its bounds are built in UTC — a
 * server-local `new Date(year, month, 0)` would drop the last day of the month on any server east
 * of Greenwich (D22; one of the Phase 13 sweep sites).
 */
export async function calculateMonthlyPayroll(year: number, month: number): Promise<PayrollRow[]> {
  await requirePermission('wages.read');

  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } }).catch(() => null);
  if (period?.status === 'CLOSED') {
    const lines = await db.misPayrollSnapshotLine.findMany({ where: { periodId: period.id }, orderBy: { employeeName: 'asc' } });
    return lines.map(snapshotToRow);
  }

  const [dailyRule, otRule, lateRule] = await Promise.all([
    getWageRuleHistory('DAILY_WAGE_DEFAULT'),
    getWageRuleHistory('OT_MULTIPLIER'),
    getWageRuleHistory('LATE_PENALTY_PER_MIN'),
  ]);
  const fallbackDailyWageOn = (date: Date): number => parseFloat(resolveAsOf(dailyRule, date)?.ruleValue ?? '500');
  const otMultiplierOn = (date: Date): number => parseFloat(resolveAsOf(otRule, date)?.ruleValue ?? '1.5');
  const latePenaltyOn = (date: Date): number => parseFloat(resolveAsOf(lateRule, date)?.ruleValue ?? '0');

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const workingDays = daysInMonth(year, month);

  const attendance: AttendanceRow[] = await db.misAttendance.findMany({
    where: { date: { gte: start, lte: end } },
    include: {
      employee: { select: { id: true, name: true, employeeCode: true, payType: true, sundayPaid: true, wageTypeCode: true } },
      shift: { select: { name: true } },
    },
    orderBy: [{ employee: { name: 'asc' } }, { date: 'asc' }],
  });

  const byEmployee: Record<string, AttendanceRow[]> = {};
  for (const a of attendance) {
    const empId = a.employee?.id ?? 'unknown';
    if (!byEmployee[empId]) byEmployee[empId] = [];
    byEmployee[empId].push(a);
  }
  const employeeIds = Object.keys(byEmployee).filter((id) => id !== 'unknown');

  // Batch: every distinct wage code this run needs, and every employee's component toggles and
  // approved extra-pay days — one query each, never one per employee (§2A.13).
  const codes = new Set<string>();
  for (const recs of Object.values(byEmployee)) codes.add(recs[0].employee?.wageTypeCode || DEFAULT_DAILY_WAGE_CODE);
  const [wageHistories, componentsByEmployee, extraPayDays] = await Promise.all([
    getWageTypeRowsForCodes([...codes]),
    getPayComponentsForEmployees(employeeIds),
    listApprovedExtraPayDaysForMonth(year, month),
  ]);

  return Object.values(byEmployee).map((records) => {
    const emp = records[0].employee!;
    const code = emp.wageTypeCode || DEFAULT_DAILY_WAGE_CODE;
    return computeEmployeeMonth(
      records,
      year,
      month,
      wageHistories.get(code),
      otMultiplierOn,
      latePenaltyOn,
      fallbackDailyWageOn,
      componentsByEmployee.get(emp.id) ?? { BASIC: true, HRA: true, ALLOWANCE: true, OT: true, BONUS: true },
      extraPayDays,
      workingDays,
    );
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
