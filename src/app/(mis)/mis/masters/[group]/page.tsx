import { notFound } from 'next/navigation';

import { MasterDataDesktopServer } from '@/components/mis/desktop/master-data-desktop-server';
import { optionMasterKey } from '@/lib/mis/master-directory';
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
  searchParams,
}: {
  params: Promise<{ group: string }>;
  searchParams: Promise<{ view?: string; q?: string; deactivated?: string; edit?: string; create?: string; error?: string }>;
}) {
  const { group } = await params;
  const sp = await searchParams;
  if (!(MASTER_GROUPS as readonly string[]).includes(group)) notFound();

  const user = await requireMisAccess();
  const [locale, rows, canWrite] = await Promise.all([
    getLocale(user.id),
    listOptions(group),
    checkPermission('masters.write'),
  ]);
  const t = createTranslator(locale);

  const phone = (
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

  // D10 from 1024px up; the existing screen below it. ANY explicit `?view` is the existing screen at every width.
  if (sp.view) return phone;
  return (
    <>
      <div className="lg:hidden">{phone}</div>
      <div className="hidden lg:block">
        <MasterDataDesktopServer master={optionMasterKey(group)!} searchParams={sp} />
      </div>
    </>
  );
}
