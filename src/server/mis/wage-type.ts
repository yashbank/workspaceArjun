import type { MisWageType } from '@/generated/prisma/client';
import type { MisPayBasis, MisWageUnit } from '@/generated/prisma/enums';
import { db } from '@/server/db';

import { DEFAULT_DAILY_WAGE_CODE, nextWageCode } from '@/lib/mis/wage-code';
import type { WageRowForCalc } from '@/lib/mis/pay-basis';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

export { DEFAULT_DAILY_WAGE_CODE };

export type WageTypeRow = {
  id: string;
  code: string;
  name: string;
  nameHi: string | null;
  amount: number;
  unit: MisWageUnit;
  /** D26. Null = this code has no OT rate set yet — a data-health finding, never a silent 0. */
  otRatePerHour: number | null;
  /** D28/25.5 — which figure a MULTIPLIER extra-pay day multiplies for an employee on this code. */
  multiplierBasis: MisPayBasis;
  /** 25.1 payslip component base amounts. Null = nothing to pay from this code for that row. */
  hraAmount: number | null;
  allowanceAmount: number | null;
  bonusAmount: number | null;
  effectiveFrom: Date;
  isActive: boolean;
};

export type WageTypeCode = { code: string; name: string; unit: MisWageUnit };

/**
 * Fields safe to write into an audit before/after payload.
 *
 * Every money field (`amount`, `otRatePerHour`, `hraAmount`, `allowanceAmount`, `bonusAmount`) is
 * deliberately absent — wages are OWNER-only, always (S9/D24), and an audit diff is the easiest
 * place to leak one by accident. `audit.ts`'s own `redact()` would also catch a stray money key,
 * but it must never be typed here in the first place. `unit` and `multiplierBasis` are NOT money
 * (a unit label, a basis flag) and are safe to keep. Grep the diff for a money field name inside
 * an audit payload: this function is the reason that must stay zero hits.
 */
function auditSafe(row: MisWageType) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameHi: row.nameHi,
    unit: row.unit,
    multiplierBasis: row.multiplierBasis,
    effectiveFrom: row.effectiveFrom,
    isActive: row.isActive,
  };
}

function toRow(row: MisWageType): WageTypeRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameHi: row.nameHi,
    amount: Number(row.amount),
    unit: row.unit,
    otRatePerHour: row.otRatePerHour == null ? null : Number(row.otRatePerHour),
    multiplierBasis: row.multiplierBasis ?? 'PER_MONTH',
    hraAmount: row.hraAmount == null ? null : Number(row.hraAmount),
    allowanceAmount: row.allowanceAmount == null ? null : Number(row.allowanceAmount),
    bonusAmount: row.bonusAmount == null ? null : Number(row.bonusAmount),
    effectiveFrom: row.effectiveFrom,
    isActive: row.isActive,
  };
}

/** The shape `lib/mis/pay-basis.ts`'s pure calculator wants — a plain, already-Numbered subset. */
function toCalcRow(row: WageTypeRow): WageRowForCalc {
  return {
    amount: row.amount,
    unit: row.unit,
    otRatePerHour: row.otRatePerHour,
    multiplierBasis: row.multiplierBasis,
    hraAmount: row.hraAmount,
    allowanceAmount: row.allowanceAmount,
    bonusAmount: row.bonusAmount,
  };
}

/**
 * Every wage type, one row per code — the latest non-deleted, effective row.
 * Owner only (S9).
 */
export async function listWageTypes(): Promise<WageTypeRow[]> {
  await requirePermission('wages.read');
  const rows = await db.misWageType.findMany({
    where: { deletedAt: null },
    orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
  });
  const seen = new Set<string>();
  const latestPerCode = rows.filter((r) => {
    if (seen.has(r.code)) return false;
    seen.add(r.code);
    return true;
  });
  return latestPerCode.map(toRow);
}

/**
 * `code` + `name` only, for a picker — never `amount`. Still Owner-gated: the
 * whole wage-type subsystem is Owner-only finance (MIS-9), so a lower-role
 * picker is a future decision, not something this phase invents.
 */
export async function listWageCodes(): Promise<WageTypeCode[]> {
  const types = await listWageTypes();
  return types.filter((t) => t.isActive).map((t) => ({ code: t.code, name: t.name, unit: t.unit }));
}

export type CreateWageTypeInput = {
  name: string;
  nameHi?: string | null;
  unit: MisWageUnit;
  amount: number;
  effectiveFrom?: Date;
  otRatePerHour?: number | null;
  multiplierBasis?: MisPayBasis;
  hraAmount?: number | null;
  allowanceAmount?: number | null;
  bonusAmount?: number | null;
};

/** Create a wage type. The code is generated, never chosen by the caller. */
export async function createWageType(input: CreateWageTypeInput): Promise<WageTypeRow> {
  const actor = await requirePermission('wages.read');
  const existing = await db.misWageType.findMany({ select: { code: true } });
  const code = nextWageCode(input.unit, existing.map((r) => r.code));

  const created = await db.misWageType.create({
    data: {
      code,
      name: input.name.trim(),
      nameHi: input.nameHi?.trim() || null,
      amount: input.amount,
      unit: input.unit,
      effectiveFrom: input.effectiveFrom ?? new Date(),
      otRatePerHour: input.otRatePerHour ?? null,
      multiplierBasis: input.multiplierBasis ?? 'PER_MONTH',
      hraAmount: input.hraAmount ?? null,
      allowanceAmount: input.allowanceAmount ?? null,
      bonusAmount: input.bonusAmount ?? null,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'wageType.create',
    entity: 'MisWageType',
    entityId: created.id,
    after: auditSafe(created),
  });

  return toRow(created);
}

/**
 * Add a new effective-dated rate under an existing code — every field, so a rate change and a
 * component-amount change are the same act (a new row), never a silent edit of the old one.
 *
 * Never mutates a past row — a decided pay period must keep reading the rate it was decided
 * under, the same rule MisBusinessRule already follows. Fields left `undefined` carry over from
 * the previous row (e.g. bumping just `amount` keeps the code's existing OT rate).
 */
export async function addWageRate(
  code: string,
  amount: number,
  effectiveFrom: Date = new Date(),
  extra: {
    otRatePerHour?: number | null;
    multiplierBasis?: MisPayBasis;
    hraAmount?: number | null;
    allowanceAmount?: number | null;
    bonusAmount?: number | null;
  } = {},
): Promise<WageTypeRow> {
  const actor = await requirePermission('wages.read');
  const existing = await db.misWageType.findFirst({
    where: { code },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!existing) throw new Error(`Wage type ${code} not found`);

  const created = await db.misWageType.create({
    data: {
      code,
      name: existing.name,
      nameHi: existing.nameHi,
      amount,
      unit: existing.unit,
      effectiveFrom,
      isActive: existing.isActive,
      otRatePerHour: extra.otRatePerHour !== undefined ? extra.otRatePerHour : existing.otRatePerHour,
      multiplierBasis: extra.multiplierBasis ?? existing.multiplierBasis,
      hraAmount: extra.hraAmount !== undefined ? extra.hraAmount : existing.hraAmount,
      allowanceAmount: extra.allowanceAmount !== undefined ? extra.allowanceAmount : existing.allowanceAmount,
      bonusAmount: extra.bonusAmount !== undefined ? extra.bonusAmount : existing.bonusAmount,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'wageType.addRate',
    entity: 'MisWageType',
    entityId: created.id,
    before: auditSafe(existing),
    after: auditSafe(created),
  });

  return toRow(created);
}

/** Turn a code on or off everywhere it appears, across every effective-dated row. */
export async function setWageTypeActive(code: string, isActive: boolean): Promise<void> {
  const actor = await requirePermission('wages.read');
  const rows = await db.misWageType.findMany({ where: { code, deletedAt: null } });
  if (rows.length === 0) throw new Error(`Wage type ${code} not found`);

  await db.$transaction(
    rows.map((r) => db.misWageType.update({ where: { id: r.id }, data: { isActive } })),
  );

  await logAuditEvent({
    actorId: actor.userId,
    action: isActive ? 'wageType.activate' : 'wageType.deactivate',
    entity: 'MisWageType',
    entityId: code,
    before: { code, isActive: rows[0].isActive },
    after: { code, isActive },
  });
}

/**
 * Every effective-dated rate for a code, oldest first — what payroll needs to price each day at
 * the rate in force ON that day (F-08, D27). Owner only, like everything that returns a wage.
 *
 * Kept to exactly `{ effectiveFrom, amount }` — `payroll-figures.test.ts` asserts this shape with
 * `toEqual`. `getWageTypeRowsForCodes` below is the FULL-row reader Phase 25 added for OT rate,
 * multiplier basis and the payslip components; it is a new function so this one never changes
 * shape under an existing test.
 */
export async function getWageRateHistory(code: string): Promise<{ effectiveFrom: Date; amount: number }[]> {
  await requirePermission('wages.read');
  const rows = await db.misWageType.findMany({
    where: { code, deletedAt: null },
    orderBy: { effectiveFrom: 'asc' },
  });
  return rows.map((r) => ({ effectiveFrom: r.effectiveFrom, amount: Number(r.amount) }));
}

/**
 * FULL effective-dated rows (amount, unit, OT rate, multiplier basis, the three payslip
 * components) for a SET of codes, in one query — payroll prices every employee's day from
 * whichever code they hold, so this batches every code a run needs rather than querying once per
 * employee (§2A.13: the runtime pool is one connection wide). Grouped by code, oldest first
 * within each group, ready for `resolveAsOf`. Owner only.
 */
export async function getWageTypeRowsForCodes(codes: readonly string[]): Promise<Map<string, (WageRowForCalc & { effectiveFrom: Date })[]>> {
  await requirePermission('wages.read');
  const result = new Map<string, (WageRowForCalc & { effectiveFrom: Date })[]>();
  if (codes.length === 0) return result;
  const rows = await db.misWageType.findMany({
    where: { code: { in: [...new Set(codes)] }, deletedAt: null },
    orderBy: { effectiveFrom: 'asc' },
  });
  for (const r of rows) {
    const row = { ...toCalcRow(toRow(r)), effectiveFrom: r.effectiveFrom };
    const list = result.get(r.code);
    if (list) list.push(row);
    else result.set(r.code, [row]);
  }
  return result;
}

/**
 * The current amount for a code, as of `asOf`. Owner only (S9 / D24): this returns a wage.
 *
 * It was once left ungated because its one caller, calculateMonthlyPayroll(), was gated on
 * attendance.read and a second gate here would have made that throw. That caller is now
 * gated on wages.read too, so the amount can no longer be reached through a weaker door.
 */
export async function getWageAmount(code: string, asOf: Date = new Date()): Promise<number | null> {
  await requirePermission('wages.read');
  const row = await db.misWageType.findFirst({
    where: { code, effectiveFrom: { lte: asOf }, deletedAt: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  return row ? Number(row.amount) : null;
}
