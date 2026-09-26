import type { MisPayComponent } from '@/generated/prisma/enums';
import { db } from '@/server/db';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

/**
 * Per-employee payslip-row toggles (25.1).
 *
 * "Basic Wage, HRA, Allowance, Salary, OT, Bonus" are six PRINTED rows behind FIVE stored
 * components — BASIC prints as "Salary" for a MONTHLY employee and "Basic Wage" for a DAILY one
 * (a display label switch on `MisEmployee.payType`, D33), never a separate stored value.
 *
 * Not effective-dated (D33) — a closed month's own figures are protected by
 * `MisPayrollPeriod`/`MisPayrollSnapshotLine`, not by this table's history, so flipping a toggle
 * today never has to prove what it showed last month. A component with no row is ENABLED by
 * default — "two people on one template show different rows" only makes sense if the template
 * starts fully on and a toggle is an explicit opt-OUT.
 *
 * None of this is money by itself (a boolean), so it is safe in an audit payload as-is — the
 * amounts these gate live entirely in `MisWageType`, already redacted there.
 */

export const ALL_PAY_COMPONENTS: readonly MisPayComponent[] = ['BASIC', 'HRA', 'ALLOWANCE', 'OT', 'BONUS'];

export type PayComponentMap = Record<MisPayComponent, boolean>;

function defaultMap(): PayComponentMap {
  return { BASIC: true, HRA: true, ALLOWANCE: true, OT: true, BONUS: true };
}

/** One employee's toggles. Owner only — this is wage STRUCTURE, the shape of a payslip. */
export async function getPayComponents(employeeId: string): Promise<PayComponentMap> {
  await requirePermission('wages.read');
  const rows = await db.misEmployeePayComponent.findMany({ where: { employeeId } });
  const map = defaultMap();
  for (const r of rows) map[r.component] = r.enabled;
  return map;
}

/**
 * Every employee's toggles in ONE query, for the payroll run — never one query per employee on
 * the whole-list page (the pool is one connection wide, §2A.13; `getStockBalances` is the pattern
 * this follows).
 */
export async function getPayComponentsForEmployees(employeeIds: string[]): Promise<Map<string, PayComponentMap>> {
  await requirePermission('wages.read');
  const result = new Map<string, PayComponentMap>(employeeIds.map((id) => [id, defaultMap()]));
  if (employeeIds.length === 0) return result;
  const rows = await db.misEmployeePayComponent.findMany({ where: { employeeId: { in: employeeIds } } });
  for (const r of rows) {
    const map = result.get(r.employeeId);
    if (map) map[r.component] = r.enabled;
  }
  return result;
}

/** Flip one component for one employee. Owner only. */
export async function setPayComponent(employeeId: string, component: MisPayComponent, enabled: boolean): Promise<void> {
  const actor = await requirePermission('wages.read');
  const before = await db.misEmployeePayComponent.findUnique({
    where: { employeeId_component: { employeeId, component } },
  });
  await db.misEmployeePayComponent.upsert({
    where: { employeeId_component: { employeeId, component } },
    create: { employeeId, component, enabled, updatedById: actor.userId },
    update: { enabled, updatedById: actor.userId },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'payComponent.set',
    entity: 'MisEmployeePayComponent',
    entityId: `${employeeId}:${component}`,
    before: before ? { component, enabled: before.enabled } : { component, enabled: true },
    after: { component, enabled },
  });
}
