import { assertTheme, DEFAULT_THEME, parseTheme, type OrgTheme } from '@/lib/mis/theme';
import { logAuditEvent } from '@/server/mis/audit';
import { requirePermission } from '@/server/mis/auth';
import { db } from '@/server/db';
import { requireMisAccess } from '@/server/mis/guard';

/**
 * R8 T3: the org-wide theme lives in ONE MisBusinessRule row (no migration), holding two allow-listed ids as JSON.
 * Hidden from the Business Rules screen (HIDDEN_RULE_KEYS) so nobody edits it as free text.
 */
export const THEME_RULE_KEY = 'ui.theme';

/** Read by every MIS page; a missing row, or a column/table problem, means the default theme (never an error page). */
export async function getOrgTheme(): Promise<OrgTheme> {
  await requireMisAccess();
  try {
    const row = await db.misBusinessRule.findFirst({ where: { ruleKey: THEME_RULE_KEY }, orderBy: { effectiveFrom: 'desc' } });
    return row ? parseTheme(row.ruleValue) : DEFAULT_THEME;
  } catch (error) {
    console.error('theme: read failed, using the default theme', error instanceof Error ? error.message : 'unknown');
    return DEFAULT_THEME;
  }
}

/** Owner only. Refuses any id off the allow-lists; audits before/after. */
export async function saveOrgTheme(input: { paletteId: unknown; fontPairId: unknown }): Promise<OrgTheme> {
  const actor = await requirePermission('theme.write');
  const next = assertTheme(input);
  const existing = await db.misBusinessRule.findFirst({ where: { ruleKey: THEME_RULE_KEY }, orderBy: { effectiveFrom: 'desc' } });
  const before = existing ? parseTheme(existing.ruleValue) : DEFAULT_THEME;
  const ruleValue = JSON.stringify(next);
  const rec = existing
    ? await db.misBusinessRule.update({ where: { id: existing.id }, data: { ruleValue, updatedById: actor.userId } })
    : await db.misBusinessRule.create({
        data: { ruleKey: THEME_RULE_KEY, ruleValue, valueType: 'json', label: 'Theme Studio', description: 'Org-wide palette and font pair (Owner, Settings > Theme Studio).', updatedById: actor.userId },
      });
  await logAuditEvent({ actorId: actor.userId, action: 'UPDATE_THEME', entity: 'MisBusinessRule', entityId: rec.id, before, after: next });
  return next;
}
