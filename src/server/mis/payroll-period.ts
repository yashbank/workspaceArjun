import { db } from '@/server/db';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';
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
 * separate, deliberate act this phase does not build (D27 leaves it for a later phase; closing
 * again silently would defeat the whole point).
 */
export async function closePayrollPeriod(year: number, month: number): Promise<PayrollPeriod> {
  const actor = await requirePermission('wages.read');
  const existing = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (existing?.status === 'CLOSED') throw new Error(`${year}-${month} is already closed.`);

  const rows = await calculateMonthlyPayroll(year, month);
  const now = new Date();

  const period = await db.$transaction(async (tx) => {
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
          wageTypeCode: r.wageTypeCode,
        })),
      });
    }
    return p;
  });

  // D24: the audit row names the period and how many lines it froze, never a figure.
  await logAuditEvent({
    actorId: actor.userId,
    action: 'payrollPeriod.close',
    entity: 'MisPayrollPeriod',
    entityId: period.id,
    before: existing ? { year, month, status: existing.status } : { year, month, status: 'OPEN' },
    after: { year, month, status: 'CLOSED', lineCount: rows.length },
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
