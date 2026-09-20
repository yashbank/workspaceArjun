import { requireMisAccess } from '@/server/mis/guard';
import { listWageCodes, listWageTypes } from '@/server/mis/wage-type';
import { WageTypeScreen } from '@/components/mis/payroll/wage-type-screen';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// listWageTypes() / listWageCodes() are the actual gate: they throw
// MisForbiddenError for anyone but OWNER (wages.read), which the (mis)
// error boundary already renders as the 403 page (MIS-36) — no separate
// role check belongs here.
export default async function WageTypesPage() {
  await requireMisAccess();
  const [wageTypes, codes] = await Promise.all([listWageTypes(), listWageCodes()]);
  return <WageTypeScreen wageTypes={wageTypes} codes={codes} />;
}
