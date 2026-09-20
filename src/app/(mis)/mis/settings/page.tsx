import { requireMisAccess } from '@/server/mis/guard';
import { getBusinessRules } from '@/server/mis/business-rules';
import { SettingsScreen } from '@/components/mis/settings/settings-screen';
import { can } from '@/lib/mis/permissions';
import { getMisRole } from '@/server/mis/roles';

export default async function SettingsPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'settings.write');
  // Wage types are Owner-only finance (MIS-9/S9): the link into
  // /mis/settings/wages is absent for every other role, not greyed out
  // (MIS_UI_SPEC §4.4 rule 4) — settings.read itself is also held by ADMIN.
  const canSeeWages = can(role, 'wages.read');
  // AQL thresholds are Owner-only (Phase 5): absent for Admin, not greyed,
  // same as the wages link above (MIS_UI_SPEC §4.4 rule 4).
  const canSeeAql = can(role, 'aql.read');
  // Gate tablets (D18): Owner and Admin. Absent for everyone else, not greyed.
  const canManageKiosk = can(role, 'kiosk.manage');
  const rules = await getBusinessRules();
  return (
    <SettingsScreen
      rules={rules}
      canWrite={canWrite}
      canSeeWages={canSeeWages}
      canSeeAql={canSeeAql}
      canManageKiosk={canManageKiosk}
    />
  );
}
