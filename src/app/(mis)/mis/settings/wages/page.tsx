import { requireMisAccess } from '@/server/mis/guard';
import { DEFAULT_FACTORY_TIMEZONE, factoryDateKey } from '@/lib/mis/factory-time';
import { listWageCodes, listWageRateHistory, listWageTypes } from '@/server/mis/wage-type';
import { WageTypeScreen } from '@/components/mis/payroll/wage-type-screen';
import { PageBack } from '@/components/mis/common/page-back';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// listWageTypes() / listWageCodes() are the actual gate: they throw
// MisForbiddenError for anyone but OWNER (wages.read), which the (mis)
// error boundary already renders as the 403 page (MIS-36) — no separate
// role check belongs here.
export default async function WageTypesPage() {
  await requireMisAccess();
  // R2-114: the full dated rate history, each row marked scheduled / in force / past as of today.
  const [wageTypes, codes, history] = await Promise.all([
    listWageTypes(),
    listWageCodes(),
    listWageRateHistory(factoryDateKey(new Date(), DEFAULT_FACTORY_TIMEZONE)),
  ]);
  return (
    <>
      <PageBack href="/mis/settings" label="Settings" />
      <WageTypeScreen wageTypes={wageTypes} codes={codes} history={history} />
    </>
  );
}
