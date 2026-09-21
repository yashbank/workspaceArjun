import { notFound } from 'next/navigation';

import { RulesDesktopServer } from '@/components/mis/desktop/rules-desktop-server';
import { SettingsScreen } from '@/components/mis/settings/settings-screen';
import { can } from '@/lib/mis/permissions';
import { getBusinessRules } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';

/**
 * D12 — Owner only, and absent (a 404) for every other role rather than refused on open (`wages.read`, D24/D25).
 * Below 1024px, and for any explicit `?view`, the phone screen is the existing settings list.
 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ view?: string; asOf?: string; rule?: string; scheduled?: string }> }) {
  const sp = await searchParams;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'wages.read')) notFound();

  const rules = await getBusinessRules();
  const phone = (
    <SettingsScreen rules={rules} canWrite={can(role, 'settings.write')} canSeeWages={true} canSeeAql={can(role, 'aql.read')} canManageKiosk={can(role, 'kiosk.manage')} />
  );
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <RulesDesktopServer asOf={sp.asOf} rule={sp.rule} scheduled={sp.scheduled === '1'} />
      </div>
    </>
  );
}
