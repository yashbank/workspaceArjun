import { QcTemplateSettingsScreen } from '@/components/mis/settings/qc-template-settings-screen';
import { requireMisAccess } from '@/server/mis/guard';
import { requirePermission } from '@/server/mis/auth';
import { listQcTemplates } from '@/server/mis/qc-template';

/** Owner/Admin (settings.write). The list itself needs only qc.read, so the write gate is asserted here. */
export default async function QcTemplateSettingsPage() {
  await requireMisAccess();
  await requirePermission('settings.write');
  const templates = await listQcTemplates(true);
  return <QcTemplateSettingsScreen templates={templates} />;
}
