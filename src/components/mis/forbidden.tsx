'use client';

import Link from 'next/link';

import { useT } from './shell/locale-provider';

/**
 * The friendly "you may not" screen.
 *
 * Rendered directly by a server component that has already established the user
 * lacks permission, so it does not depend on a thrown error surviving Next's
 * production error sanitisation.
 */
export function Forbidden() {
  const t = useT();

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-lg font-semibold text-slate-900">{t('error.forbidden.title')}</h1>
      <p className="text-base text-slate-600">{t('error.forbidden.body')}</p>
      <Link
        href="/mis"
        className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
      >
        {t('error.backHome')}
      </Link>
    </div>
  );
}
