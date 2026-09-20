import { requireMisAccess } from '@/server/mis/guard';
import { getAqlThresholdRules } from '@/server/mis/business-rules';
import { AqlSettingsScreen } from '@/components/mis/settings/aql-settings-screen';

// requireMisAccess() only checks the feature flag / MIS login, not role.
// getAqlThresholdRules() is the actual gate: it throws MisForbiddenError for
// anyone but OWNER (aql.read), which the (mis) error boundary already
// renders as the 403 page — same pattern as /mis/settings/wages.
export default async function AqlSettingsPage() {
  await requireMisAccess();
  const rules = await getAqlThresholdRules();
  return <AqlSettingsScreen rules={rules} />;
}
