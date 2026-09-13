import Link from 'next/link';

import { MASTER_GROUPS } from '@/lib/mis/master-groups';
import { createTranslator, type TranslationKey } from '@/lib/mis/i18n';
import { countsByGroup } from '@/server/mis/master-option';
import { getLocale } from '@/server/mis/preferences';
import { requireMisAccess } from '@/server/mis/guard';

/**
 * The masters index.
 *
 * Seven groups, one row each. Adding an eighth is a string in
 * lib/mis/master-groups.ts — no new page, no new component, no migration.
 */
export default async function MastersIndexPage() {
  const user = await requireMisAccess();
  const [locale, counts] = await Promise.all([getLocale(user.id), countsByGroup()]);
  const t = createTranslator(locale);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="text-xl font-semibold text-slate-900">{t('masters.title')}</h1>

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
    </div>
  );
}
