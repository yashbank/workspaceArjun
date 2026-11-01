import { requireMisAccess } from '@/server/mis/guard';
import { getAqlLimitRules, getAqlThresholdRules } from '@/server/mis/business-rules';
import { AqlSettingsScreen } from '@/components/mis/settings/aql-settings-screen';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// getAqlThresholdRules() is the actual gate: it throws MisForbiddenError for
// anyone but OWNER (aql.read), which the (mis) error boundary already
// renders as the 403 page — same pattern as /mis/settings/wages.
export default async function AqlSettingsPage() {
  await requireMisAccess();
  // R2-314: the fixed thresholds plus the Z1.4 Major / Minor limits.
  const rules = [...(await getAqlThresholdRules()), ...(await getAqlLimitRules())];
  return <AqlSettingsScreen rules={rules} />;
}
