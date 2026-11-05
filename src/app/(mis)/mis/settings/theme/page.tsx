import { ThemeStudioScreen } from '@/components/mis/settings/theme-studio-screen';
import { requirePermission } from '@/server/mis/auth';
import { requireMisAccess } from '@/server/mis/guard';
import { getOrgTheme } from '@/server/mis/theme';

// requirePermission('data.reset') is the gate: Owner only. Everyone else gets the 403 page from the (mis) error boundary.
export default async function ThemeStudioPage() {
  await requireMisAccess();
  await requirePermission('data.reset');
  return <ThemeStudioScreen saved={await getOrgTheme()} />;
}
