import { notFound } from 'next/navigation';

import { OptionMasterScreen } from '@/components/mis/masters/option-master-screen';
import { MASTER_GROUPS, type MasterGroup } from '@/lib/mis/master-groups';
import { createTranslator, type TranslationKey } from '@/lib/mis/i18n';
import { checkPermission } from '@/server/mis/auth';
import { listOptions } from '@/server/mis/master-option';
import { getLocale } from '@/server/mis/preferences';
import { requireMisAccess } from '@/server/mis/guard';

import { deleteOptionAction, restoreOptionAction, saveOptionAction } from '../actions';

/**
 * One screen serving all seven option masters.
 *
 * An unknown group 404s rather than rendering an empty table, so a typo in a
 * URL does not look like "this master has no data".
 */
export default async function OptionMasterPage({
  params,
}: {
  params: Promise<{ group: string }>;
}) {
  const { group } = await params;
  if (!(MASTER_GROUPS as readonly string[]).includes(group)) notFound();

  const user = await requireMisAccess();
  const [locale, rows, canWrite] = await Promise.all([
    getLocale(user.id),
    listOptions(group),
    checkPermission('masters.write'),
  ]);
  const t = createTranslator(locale);

  return (
    <OptionMasterScreen
      group={group}
      title={t(`masters.${group as MasterGroup}` as TranslationKey)}
      rows={rows}
      canWrite={canWrite}
      onSave={saveOptionAction}
      onDelete={deleteOptionAction}
      onRestore={restoreOptionAction}
    />
  );
}
