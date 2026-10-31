import { factoryDateKey, DEFAULT_FACTORY_TIMEZONE } from '@/lib/mis/factory-time';
import { getCurrentUser } from '@/server/auth';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { MisForbiddenError, requirePermission } from './auth';
import { calculateMonthlyPayroll, type PayrollRow } from './payroll';

/**
 * Payslips as documents: the Owner's bulk print (R2-109) and the Owner → employee RELEASE
 * (R2-111, D: "Employees do NOT self-serve payslips").
 *
 * Release rule. The Owner sends a CLOSED month's payslip (the frozen `MisPayrollSnapshotLine`) to
 * an employee; that employee may then open it, and only it:
 *  - only their OWN slip — the employee id comes from their login, never from the request;
 *  - only a month that was RELEASED to them;
 *  - only a PREVIOUS month — never the current one, even if a row somehow exists;
 *  - never a wage setting: no rate, no wage code, no rule. Only the figures printed on the slip.
 * Requiring a closed month means what the employee sees can never move after it was sent.
 */

export type PayslipEmployee = { id: string; name: string; employeeCode: string; role: string; departmentName: string | null };
export type PayslipDoc = { employee: PayslipEmployee; row: PayrollRow };

/** Only "the table does not exist yet" (the R2 batch #2 migration not applied) reads as "nothing released". */
function isMissingRelationError(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'P2021' || (typeof e?.message === 'string' && /relation .* does not exist/i.test(e.message));
}

function assertRealMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a year between 2000 and 2100.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a month between 1 and 12.');
}

/** year*12+month of the factory's current month — a slip is visible only strictly before it. */
function currentMonthIndex(now: Date = new Date()): number {
  const [y, m] = factoryDateKey(now, DEFAULT_FACTORY_TIMEZONE).split('-').map(Number);
  return y * 12 + m;
}
const isPreviousMonth = (year: number, month: number, now: Date = new Date()) => year * 12 + month < currentMonthIndex(now);

// ---------------------------------------------------------------------------
// R2-109 — bulk print (Owner)
// ---------------------------------------------------------------------------

/**
 * Every payslip for a month, for one print run. ONE `calculateMonthlyPayroll` (a CLOSED month reads
 * its snapshot) and ONE employee query for the designation lines — never a recompute per employee.
 * Owner only (`wages.read`).
 */
export async function getPayslipBatch(year: number, month: number): Promise<PayslipDoc[]> {
  await requirePermission('wages.read');
  assertRealMonth(year, month);
  const rows = await calculateMonthlyPayroll(year, month);
  if (rows.length === 0) return [];
  const people = await db.misEmployee.findMany({
    where: { id: { in: rows.map((r) => r.employeeId) } },
    select: { id: true, name: true, employeeCode: true, role: true, department: { select: { name: true } } },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  return [...rows]
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
    .map((row) => {
      const p = byId.get(row.employeeId);
      return {
        employee: {
          id: row.employeeId,
          name: row.employeeName,
          employeeCode: row.employeeCode,
          role: p?.role ?? 'WORKER',
          departmentName: p?.department?.name ?? null,
        },
        row,
      };
    });
}

// ---------------------------------------------------------------------------
// R2-111 — release (Owner)
// ---------------------------------------------------------------------------

export type PayslipReleaseRow = { employeeId: string; releasedAt: Date };

/** Who has been sent this month's payslip. Owner only. Empty before the migration is applied. */
export async function listPayslipReleases(year: number, month: number): Promise<PayslipReleaseRow[]> {
  await requirePermission('wages.read');
  try {
    const rows = await db.misPayslipRelease.findMany({ where: { year, month }, select: { employeeId: true, releasedAt: true } });
    return rows.map((r) => ({ employeeId: r.employeeId, releasedAt: r.releasedAt }));
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
}

/**
 * Send a closed month's payslips: to `employeeIds`, or to everyone with a frozen line when omitted.
 * Already-sent slips are left as they are (sending twice is not an error). Owner only; audited with
 * the month and a count, never a figure.
 */
export async function releasePayslips(year: number, month: number, employeeIds?: string[]): Promise<{ released: number; alreadyReleased: number }> {
  const actor = await requirePermission('wages.read');
  assertRealMonth(year, month);
  if (!isPreviousMonth(year, month)) throw new Error('Only a past month’s payslip can be sent.');

  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (period?.status !== 'CLOSED') throw new Error('Close this month first — only a closed month’s frozen payslip can be sent.');

  const lines = await db.misPayrollSnapshotLine.findMany({ where: { periodId: period.id }, select: { employeeId: true } });
  const frozen = new Set(lines.map((l) => l.employeeId));
  const wanted = employeeIds ? [...new Set(employeeIds)] : [...frozen];
  const missing = wanted.filter((id) => !frozen.has(id));
  if (missing.length > 0) throw new Error('No payslip was frozen for that employee in this month.');
  if (wanted.length === 0) return { released: 0, alreadyReleased: 0 };

  const existing = await db.misPayslipRelease.findMany({ where: { year, month, employeeId: { in: wanted } }, select: { employeeId: true } });
  const already = new Set(existing.map((r) => r.employeeId));
  const fresh = wanted.filter((id) => !already.has(id));
  if (fresh.length > 0) {
    await db.misPayslipRelease.createMany({
      data: fresh.map((employeeId) => ({ employeeId, year, month, releasedById: actor.userId })),
      skipDuplicates: true,
    });
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: 'payslip.release',
    entity: 'MisPayslipRelease',
    entityId: employeeIds?.length === 1 ? employeeIds[0] : null,
    after: { year, month, released: fresh.length, alreadyReleased: already.size },
  });
  return { released: fresh.length, alreadyReleased: already.size };
}

/** Take a sent payslip back: the employee can no longer open it. Owner only, audited. */
export async function withdrawPayslipRelease(employeeId: string, year: number, month: number): Promise<void> {
  const actor = await requirePermission('wages.read');
  assertRealMonth(year, month);
  const { count } = await db.misPayslipRelease.deleteMany({ where: { employeeId, year, month } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'payslip.withdraw',
    entity: 'MisPayslipRelease',
    entityId: employeeId,
    before: { year, month, released: count > 0 },
    after: { year, month, released: false },
  });
}

// ---------------------------------------------------------------------------
// R2-111 — the employee's own view
// ---------------------------------------------------------------------------

/**
 * The signed-in person's OWN employee record, or a refusal. This is an identity gate, not a role
 * grant: it hands out nothing but the caller's own released slips, so no matrix action is widened
 * (`wages.read` stays Owner-only). The refusal names `wages.read` because every other door to a
 * payslip is that one.
 */
async function requireOwnEmployee() {
  const user = await getCurrentUser();
  if (!user) throw new MisForbiddenError('wages.read', 'own payslip');
  const me = await db.misEmployee.findUnique({
    where: { userProfileId: user.id },
    select: { id: true, name: true, employeeCode: true, role: true, isActive: true, deletedAt: true, department: { select: { name: true } } },
  });
  if (!me || me.deletedAt || !me.isActive) throw new MisForbiddenError('wages.read', 'own payslip');
  return me;
}

export type MyPayslipEntry = { year: number; month: number; releasedAt: Date };

/** The months the Owner has sent ME, newest first — previous months only. No figures. */
export async function listMyPayslips(): Promise<MyPayslipEntry[]> {
  const me = await requireOwnEmployee();
  let rows: { year: number; month: number; releasedAt: Date }[];
  try {
    rows = await db.misPayslipRelease.findMany({
      where: { employeeId: me.id },
      select: { year: true, month: true, releasedAt: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  } catch (error) {
    if (isMissingRelationError(error)) return [];
    throw error;
  }
  return rows.filter((r) => isPreviousMonth(r.year, r.month)).map((r) => ({ year: r.year, month: r.month, releasedAt: r.releasedAt }));
}

/**
 * MY payslip for one month, or null (unknown, not sent, current month, not closed). Reads the frozen
 * snapshot line scoped to the caller's own employee id; the wage code is dropped — a slip shows what
 * was paid, never the rate setting behind it.
 */
export async function getMyPayslip(year: number, month: number): Promise<PayslipDoc | null> {
  const me = await requireOwnEmployee();
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!isPreviousMonth(year, month)) return null;

  let release: { id: string } | null;
  try {
    release = await db.misPayslipRelease.findUnique({ where: { employeeId_year_month: { employeeId: me.id, year, month } }, select: { id: true } });
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
  if (!release) return null;

  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (period?.status !== 'CLOSED') return null;
  const line = await db.misPayrollSnapshotLine.findFirst({ where: { periodId: period.id, employeeId: me.id } });
  if (!line) return null;

  const n = (v: unknown) => Number(v);
  return {
    employee: { id: me.id, name: me.name, employeeCode: me.employeeCode, role: me.role, departmentName: me.department?.name ?? null },
    row: {
      employeeId: me.id,
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
      // R2-324: a line frozen before the deduction columns existed has no net; it then reads as gross (no deductions known).
      pf: n(line.pf ?? 0), esic: n(line.esic ?? 0), pt: n(line.pt ?? 0), advance: n(line.advance ?? 0), netPay: n(line.netPay ?? line.grossPay),
      wageTypeCode: null,
    },
  };
}
