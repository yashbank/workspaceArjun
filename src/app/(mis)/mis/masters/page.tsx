import Link from 'next/link';

import { MASTER_GROUPS } from '@/lib/mis/master-groups';
import { createTranslator, type TranslationKey } from '@/lib/mis/i18n';
import { countsByGroup } from '@/server/mis/master-option';
import { getLocale } from '@/server/mis/preferences';
import { requireMisAccess } from '@/server/mis/guard';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getMasterDirectory } from '@/server/mis/master-directory';
import { MasterNavSidebar } from '@/components/mis/desktop/master-data-desktop';
import { DesktopPageHeader } from '@/components/mis/desktop/desktop-shell';

/**
 * The masters index.
 *
 * Seven groups, one row each. Adding an eighth is a string in
 * lib/mis/master-groups.ts — no new page, no new component, no migration.
 *
 * Below 1024px this is the whole screen: a menu of groups (no PNG shows a
 * dedicated phone index, so this stays the simple picker it always was).
 * From 1024px up, D10 never shows a picker alone — every one of the eleven
 * master pages draws the same left sub-nav beside its list — so this index
 * wears that same sub-nav too, rather than floating as a lone ~670px column
 * in the wide desktop shell (24G).
 */
export default async function MastersIndexPage() {
  const user = await requireMisAccess();
  const [locale, counts] = await Promise.all([getLocale(user.id), countsByGroup()]);
  const t = createTranslator(locale);

  let directory = null;
  try {
    directory = await getMasterDirectory();
  } catch (error) {
    if (!isMisForbiddenError(error)) console.error('[mis-masters] directory failed to load', error);
  }

  const groupList = (
    <ul className="flex flex-col gap-2">
      {MASTER_GROUPS.map((group) => (
        <li key={group}>
          <Link
            href={`/mis/masters/${group}`}
            className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 hover:bg-slate-50"
          >
            <span className="text-base font-medium text-slate-900">
              {t(`masters.${group}` as TranslationKey)}
            </span>
            <span className="text-sm text-slate-500">
              {counts[group] ?? 0} {t('masters.optionCount')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Phone / tablet: the picker, unchanged. */}
      <div className="mx-auto flex max-w-2xl flex-col gap-3 lg:hidden">
        <h1 className="text-xl font-semibold text-slate-900">{t('masters.title')}</h1>
        {groupList}
      </div>

      {/* Desktop: the D10 sub-nav beside a full-width content pane, matching every other master page. */}
      <div className="hidden lg:block">
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
          <span>{t('d10.crumb.settings')}</span>
          <span aria-hidden="true">/</span>
          <span className="font-semibold text-slate-900">{t('d10.crumb.masterData')}</span>
        </nav>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          {directory ? <MasterNavSidebar directory={directory} /> : <div />}

          <section className="min-w-0">
            <DesktopPageHeader title={t('masters.title')} summary={`${MASTER_GROUPS.length} ${t('masters.optionCount')}`} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {MASTER_GROUPS.map((group) => (
                <Link
                  key={group}
                  href={`/mis/masters/${group}`}
                  className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 hover:bg-slate-50"
                >
                  <span className="text-base font-medium text-slate-900">
                    {t(`masters.${group}` as TranslationKey)}
                  </span>
                  <span className="text-sm text-slate-500">
                    {counts[group] ?? 0} {t('masters.optionCount')}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
