/**
 * D12's read: every business rule, its history, and the value in force on a chosen day.
 *
 * OWNER only (`wages.read`, the Owner's marker — D24/D25): this screen reaches the wage rates payroll pays and
 * the AQL limits QC accepts, so it is the one place a rule change is scheduled. Reuses the store the phone
 * settings screen reads (`MisBusinessRule`) and adds only the composition; the reasons come from the audit rows
 * the change itself wrote, so no schema change is needed.
 */

import { buildRulesLedger, isDayKey, type RulesLedgerView } from '@/lib/mis/rules-ledger';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { factoryDateKey } from '@/lib/mis/factory-time';
import { isWageRuleKey } from '@/lib/mis/rule-keys';

const SENSITIVE_KEYS = (keys: readonly string[]) => keys.filter((k) => isWageRuleKey(k) || k.startsWith('AQL_'));

export async function getRulesLedger(
  input: { asOf?: unknown; rule?: unknown } = {},
  now: Date = new Date(),
): Promise<RulesLedgerView> {
  await requirePermission('wages.read');
  const timeZone = await getFactoryTimezone();
  const todayKey = factoryDateKey(now, timeZone);
  const asOf = isDayKey(input.asOf) ? input.asOf : todayKey;

  const rows = await db.misBusinessRule.findMany({
    select: { id: true, ruleKey: true, ruleValue: true, valueType: true, label: true, description: true, effectiveFrom: true, updatedById: true, updatedAt: true },
    orderBy: [{ ruleKey: 'asc' }, { effectiveFrom: 'asc' }],
  });

  const ids = rows.map((r) => r.id);
  const audits = ids.length
    ? await db.misAuditLog.findMany({ where: { entity: 'MisBusinessRule', entityId: { in: ids }, action: 'SCHEDULE_RULE' }, select: { entityId: true, after: true } })
    : [];
  const reasons = new Map<string, string>();
  for (const a of audits) {
    const reason = (a.after as { reason?: unknown } | null)?.reason;
    if (a.entityId && typeof reason === 'string' && reason.trim()) reasons.set(a.entityId, reason);
  }

  const personIds = [...new Set(rows.map((r) => r.updatedById).filter((id): id is string => !!id))];
  const people = personIds.length ? await db.userProfile.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(people.filter((p) => p.name).map((p) => [p.id, p.name as string]));

  const ledger = buildRulesLedger(rows, { asOf, todayKey, names, reasons });
  const wanted = typeof input.rule === 'string' ? input.rule : null;
  const selectedKey = ledger.rules.find((r) => r.ruleKey === wanted)?.ruleKey ?? ledger.rules[0]?.ruleKey ?? null;
  return { ...ledger, selectedKey, sensitiveKeys: SENSITIVE_KEYS(ledger.rules.map((r) => r.ruleKey)) };
}
