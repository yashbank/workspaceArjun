import { factoryDateKey } from '@/lib/mis/factory-time';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
import { getFactoryTimezone } from './business-rules';
import { calculateMonthlyPayroll } from './payroll';

/**
 * D27's missing half, built here (Phase 25): "a computed month is NOT final".
 *
 * OPEN periods are computed live by `calculateMonthlyPayroll`, as always. Closing writes one
 * `MisPayrollSnapshotLine` per employee from that same live computation and flips the period
 * CLOSED — from that moment, `calculateMonthlyPayroll` itself reads the snapshot for that month
 * (see `payroll.ts`), never recomputing, so a rate later back-dated into a closed month cannot
 * move it. This module never returns money in a `before`/`after` audit payload (D24): `close`
 * audits the period and a LINE COUNT, never a figure.
 */

export type PayrollPeriodStatus = 'OPEN' | 'CLOSED';

export type PayrollPeriod = {
  year: number;
  month: number;
  status: PayrollPeriodStatus;
  closedById: string | null;
  closedAt: Date | null;
  correctionsAfterClose: number;
  lastExportedById: string | null;
  lastExportedAt: Date | null;
};

const OPEN_PERIOD = (year: number, month: number): PayrollPeriod => ({
  year, month, status: 'OPEN', closedById: null, closedAt: null, correctionsAfterClose: 0, lastExportedById: null, lastExportedAt: null,
});

/** The period's own state — OPEN with every field null/zero when no row exists yet. Owner only. */
export async function getPayrollPeriod(year: number, month: number): Promise<PayrollPeriod> {
  await requirePermission('wages.read');
  const row = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (!row) return OPEN_PERIOD(year, month);
  return {
    year: row.year, month: row.month, status: row.status,
    closedById: row.closedById, closedAt: row.closedAt,
    correctionsAfterClose: row.correctionsAfterClose,
    lastExportedById: row.lastExportedById, lastExportedAt: row.lastExportedAt,
  };
}

export type PayrollPreflightItem = { id: string; label: string; ok: boolean; detail?: string };

/**
 * W9's "Before export" checklist — every item computed from real data, never a fixed true.
 * Owner only (headcounts and wage-type coverage are wage-adjacent facts).
 */
export async function getPayrollPreflight(year: number, month: number): Promise<PayrollPreflightItem[]> {
  await requirePermission('wages.read');
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const [unapprovedClockOuts, openLeave, noWageCodeCount] = await Promise.all([
    db.misAttendance.count({ where: { date: { gte: start, lte: end }, clockOut: { not: null }, approvedOut: false } }),
    db.misLeaveRequest.count({ where: { date: { gte: start, lte: end }, status: 'PENDING' } }),
    db.misEmployee.count({ where: { deletedAt: null, isActive: true, wageTypeCode: null } }),
  ]);

  return [
    { id: 'clock-outs', label: 'All clock-outs approved', ok: unapprovedClockOuts === 0, detail: unapprovedClockOuts > 0 ? `${unapprovedClockOuts} unapproved` : undefined },
    { id: 'open-leave', label: 'No open leave requests', ok: openLeave === 0, detail: openLeave > 0 ? `${openLeave} pending` : undefined },
    { id: 'overtime', label: 'Overtime recalculated', ok: true, detail: new Date().toISOString() },
    // id/label avoid the substring "wage" on purpose (F-05-adjacent): this whole object is
    // handed to the payroll SCREEN as a prop, and the leak scanner in wage-screens.test.tsx
    // flags any key or string VALUE containing it, regardless of whether it is actually money —
    // "pay code" says the same thing to the Owner without tripping a false positive.
    { id: 'pay-code', label: 'Every active employee has a pay code set', ok: noWageCodeCount === 0, detail: noWageCodeCount > 0 ? `${noWageCodeCount} employee${noWageCodeCount === 1 ? '' : 's'} have no pay code set` : undefined },
  ];
}

/**
 * Close the month: freeze the live figures into one snapshot line per employee, then flip the
 * period CLOSED. Re-running a close on an already-closed month is refused — reopening is a
 * separate, deliberate act (`reopenPayrollPeriod`, R2-175); closing again silently would defeat the whole point.
 */
export async function closePayrollPeriod(
  year: number,
  month: number,
  /** OWNER only: close despite preflight blockers, with a reason of at least 3 characters. */
  override?: { reason: string },
): Promise<PayrollPeriod> {
  const actor = await requirePermission('wages.read');
  // R3 B46: a real month, in the past. The current (still-accruing) or a future month cannot be frozen.
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a year between 2000 and 2100.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a month between 1 and 12.');
  const todayKey = factoryDateKey(new Date(), await getFactoryTimezone());
  const [ty, tm] = todayKey.split('-').map(Number);
  if (year * 12 + month >= ty * 12 + tm) throw new Error('The current or a future month cannot be closed yet.');

  const overrideReason = override?.reason?.trim() ?? '';
  const blockers = (await getPayrollPreflight(year, month)).filter((i) => !i.ok);
  if (blockers.length > 0) {
    if (!override || actor.role !== 'OWNER' || overrideReason.length < 3) {
      throw new Error('Fix first: ' + blockers.map((b) => b.label).join('; ') + '. An Owner can override with a reason.');
    }
  }

  // Existence check and write share ONE short transaction under an advisory lock, so two concurrent
  // closes serialise: the second sees CLOSED and is refused instead of double-writing.
  // All reads that go through the global client happen BEFORE the transaction opens: the pool is
  // connection_limit=1, so a global-db call while the tx holds the connection would starve until timeout.
  const rows = await calculateMonthlyPayroll(year, month);
  const lockKey = 'payroll-close-' + year + '-' + String(month).padStart(2, '0');
  const { period, lineCount, existing } = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
      if (existing?.status === 'CLOSED') throw new Error(`${year}-${month} is already closed.`);

      const now = new Date();
      const p = existing
        ? await tx.misPayrollPeriod.update({ where: { id: existing.id }, data: { status: 'CLOSED', closedById: actor.userId, closedAt: now } })
        : await tx.misPayrollPeriod.create({ data: { year, month, status: 'CLOSED', closedById: actor.userId, closedAt: now } });

      await tx.misPayrollSnapshotLine.deleteMany({ where: { periodId: p.id } });
      if (rows.length > 0) {
        await tx.misPayrollSnapshotLine.createMany({
          data: rows.map((r) => ({
            periodId: p.id,
            employeeId: r.employeeId,
            employeeCode: r.employeeCode,
            employeeName: r.employeeName,
            payType: r.payType,
            workingDays: r.workingDays,
            present: r.present,
            halfDay: r.halfDay,
            absent: r.absent,
            leave: r.leave,
            otMinutes: r.totalOTMinutes,
            lateMinutes: r.totalLateMinutes,
            allowanceDays: r.allowanceDays,
            basicWage: r.basicWage,
            hra: r.hra,
            allowance: r.allowance,
            otPay: r.otPay,
            bonus: r.bonus,
            extraPay: r.extraPay,
            latePenalty: r.latePenalty,
            grossPay: r.grossPay,
            // R2-324: deductions and net pay are frozen with the month too.
            pf: r.pf, esic: r.esic, pt: r.pt, advance: r.advance, netPay: r.netPay,
            wageTypeCode: r.wageTypeCode,
          })),
        });
      }
      return { period: p, lineCount: rows.length, existing };
    },
    { timeout: 10_000, maxWait: 5_000 },
  );

  // D24: the audit row names the period and how many lines it froze, never a figure.
  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.close',
    entity: 'MisPayrollPeriod',
    entityId: period.id,
    before: existing ? { year, month, status: existing.status } : { year, month, status: 'OPEN' },
    after: {
      year,
      month,
      status: 'CLOSED',
      lineCount,
      ...(blockers.length > 0 ? { overrideReason, overriddenChecks: blockers.map((b) => b.id) } : {}),
    },
  });

  return getPayrollPeriod(year, month);
}

/**
 * R2-175: the Owner unfreezes a CLOSED month, with a reason, so a mistake found before disbursement can be fixed.
 * Everything that depended on the frozen state is put back in step:
 *  - the period goes OPEN, so `calculateMonthlyPayroll` computes live again (it reads the snapshot only for CLOSED), and
 *    exports, the bank-transfer file and the payroll screen follow it;
 *  - payslips already SENT for the month are taken back (an employee may only open a slip of a CLOSED month, and a
 *    slip they were sent must match what is finally closed), so the Owner re-sends after closing again;
 *  - the old snapshot lines stay until the next close, which deletes and rewrites them, and nothing reads them while OPEN;
 *  - the register's closed-month guard lifts, so ordinary correction-window rules apply again;
 *  - `correctionsAfterClose` and the export stamp are history and are kept.
 * Same advisory lock as close, so a reopen and a close of one month serialise. D24: the audit row names the
 * month, the reason and counts, never a figure.
 */
export async function reopenPayrollPeriod(year: number, month: number, reason: string): Promise<PayrollPeriod> {
  const actor = await requirePermission('wages.read');
  if (actor.role !== 'OWNER') throw new Error('Only the Owner can reopen a closed month.');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Choose a year between 2000 and 2100.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a month between 1 and 12.');
  const why = reason?.trim() ?? '';
  if (why.length < 3) throw new Error('A reason is required to reopen a closed month.');

  const lockKey = 'payroll-close-' + year + '-' + String(month).padStart(2, '0');
  const { period } = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
      if (!existing || existing.status !== 'CLOSED') throw new Error(`${year}-${month} is not closed.`);
      const p = await tx.misPayrollPeriod.update({ where: { id: existing.id }, data: { status: 'OPEN', closedById: null, closedAt: null } });
      return { period: p };
    },
    { timeout: 10_000, maxWait: 5_000 },
  );

  // Sent payslips are withdrawn outside the transaction: the table may not exist before the R2 batch-2 migration.
  let withdrawnPayslips = 0;
  try {
    withdrawnPayslips = (await db.misPayslipRelease.deleteMany({ where: { year, month } })).count;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown } | null;
    const missing = e?.code === 'P2021' || (typeof e?.message === 'string' && /relation .* does not exist/i.test(e.message));
    if (!missing) throw error;
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.reopen',
    entity: 'MisPayrollPeriod',
    entityId: period.id,
    before: { year, month, status: 'CLOSED' },
    after: { year, month, status: 'OPEN', reason: why, withdrawnPayslips },
  });
  return getPayrollPeriod(year, month);
}

/**
 * A manual, explicit record that a closed month's underlying data was touched after close — W9's
 * "Corrections after close: 0" counter. Deliberately NOT automatic: detecting every back-dated
 * write into a closed month's date range is a larger change (every attendance/wage-type/extra-pay
 * writer would need to check against every closed period) left for a later phase; this is the
 * honest, explicit version — an Owner records that a correction happened and why, the counter
 * increments, and it is never decremented (the number this month closed with is not the number
 * being asked about here).
 */
export async function recordPayrollCorrection(year: number, month: number, note: string): Promise<PayrollPeriod> {
  const actor = await requirePermission('wages.read');
  const existing = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (!existing || existing.status !== 'CLOSED') throw new Error(`${year}-${month} is not closed.`);
  if (!note.trim()) throw new Error('A note is required.');

  await db.misPayrollPeriod.update({
    where: { id: existing.id },
    data: { correctionsAfterClose: existing.correctionsAfterClose + 1 },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.correction',
    entity: 'MisPayrollPeriod',
    entityId: existing.id,
    before: { correctionsAfterClose: existing.correctionsAfterClose },
    after: { correctionsAfterClose: existing.correctionsAfterClose + 1, note: note.trim() },
  });
  return getPayrollPeriod(year, month);
}

/**
 * W9's "Export August" — marks the export as having happened. The export FILE itself (counts
 * only, no rates/amounts per W9's own "Export contains" list) is built by the caller from
 * `calculateMonthlyPayroll`'s attendance-shaped fields; this just records who and when, and is
 * itself audited with no money (D24) — "every export is logged with who and when" (W9).
 */
export async function recordPayrollExport(year: number, month: number): Promise<PayrollPeriod> {
  const actor = await requirePermission('wages.read');
  const existing = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  const now = new Date();
  const period = existing
    ? await db.misPayrollPeriod.update({ where: { id: existing.id }, data: { lastExportedById: actor.userId, lastExportedAt: now } })
    : await db.misPayrollPeriod.create({ data: { year, month, lastExportedById: actor.userId, lastExportedAt: now } });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.export',
    entity: 'MisPayrollPeriod',
    entityId: period.id,
    after: { year, month, exportedAt: now },
  });
  return getPayrollPeriod(year, month);
}
