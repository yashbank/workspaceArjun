import { db } from '@/server/db';
import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { formatMoney } from './po';

/**
 * R2-324: salary advances to recover from one month's pay. Owner only (`wages.read`, the money gate, S9 / D24):
 * an advance is a wage figure. Payroll deducts the month's total per employee (`payroll.ts`), capped so net pay
 * never goes below zero. A CLOSED month is frozen: nothing may be added to or removed from it.
 * Audit rows carry who / which employee / which month — never the amount.
 */
export type SalaryAdvanceRow = { id: string; employeeId: string; employeeName: string; employeeCode: string; amount: number; amountFormatted: string; notes: string | null; createdAt: Date };

/** A CLOSED month's figures are frozen (D27): its deductions cannot change without reopening it. */
async function assertMonthOpen(year: number, month: number) {
  const period = await db.misPayrollPeriod.findUnique({ where: { year_month: { year, month } } });
  if (period?.status === 'CLOSED') throw new Error(`${year}-${String(month).padStart(2, '0')} is closed; reopen the month to change its deductions.`);
}

function assertMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a real month.');
}

export async function listSalaryAdvances(year: number, month: number): Promise<SalaryAdvanceRow[]> {
  await requirePermission('wages.read');
  assertMonth(year, month);
  const rows = await db.misSalaryAdvance.findMany({
    where: { year, month },
    include: { employee: { select: { name: true, employeeCode: true } } },
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map((r) => ({
    id: r.id, employeeId: r.employeeId, employeeName: r.employee.name, employeeCode: r.employee.employeeCode,
    amount: Number(r.amount), amountFormatted: formatMoney(Number(r.amount)), notes: r.notes, createdAt: r.createdAt,
  }));
}

export async function recordSalaryAdvance(input: { employeeId: string; year: number; month: number; amount: number; notes?: string | null }) {
  const actor = await requirePermission('wages.read');
  assertMonth(input.year, input.month);
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an advance amount above zero (whole rupees).');
  await assertMonthOpen(input.year, input.month);
  const employee = await db.misEmployee.findUnique({ where: { id: input.employeeId }, select: { id: true, deletedAt: true } });
  if (!employee || employee.deletedAt) throw new Error('Employee not found.');
  const row = await db.misSalaryAdvance.create({
    data: { employeeId: input.employeeId, year: input.year, month: input.month, amount, notes: input.notes?.trim() || null, createdById: actor.userId },
  });
  await logAuditEvent({
    actorId: actor.userId, action: 'payrollAdvance.record', entity: 'MisSalaryAdvance', entityId: row.id,
    after: { employeeId: input.employeeId, year: input.year, month: input.month }, // never the amount (D24)
  });
  return { id: row.id };
}

export async function deleteSalaryAdvance(id: string) {
  const actor = await requirePermission('wages.read');
  const row = await db.misSalaryAdvance.findUnique({ where: { id } });
  if (!row) throw new Error('Advance not found.');
  await assertMonthOpen(row.year, row.month);
  await db.misSalaryAdvance.delete({ where: { id } });
  await logAuditEvent({
    actorId: actor.userId, action: 'payrollAdvance.delete', entity: 'MisSalaryAdvance', entityId: id,
    before: { employeeId: row.employeeId, year: row.year, month: row.month },
  });
}
