'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/mis/kit/button';
import { useT } from '@/components/mis/shell/locale-provider';

/**
 * The MIS error boundary.
 *
 * When the server says no, the user sees something calm and readable instead of
 * a stack trace or a blank screen.
 *
 * Caveat worth knowing: Next sanitises server error messages in production, so
 * `error.name` is only reliable in development. Rather than guess, anything we
 * cannot positively identify as a permission refusal is shown as a general
 * error — better a generic message than a wrong one. Server modules that want a
 * guaranteed forbidden screen should render <Forbidden/> directly rather than
 * relying on the throw reaching here intact.
 */
export default function MisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  const forbidden = error.name === 'MisForbiddenError';

  useEffect(() => {
    console.error('[mis] boundary caught', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-3 py-12">
      <h1 className="text-lg font-semibold text-slate-900">
        {forbidden ? t('error.forbidden.title') : t('error.title')}
      </h1>
      {forbidden && <p className="text-base text-slate-600">{t('error.forbidden.body')}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {!forbidden && (
          <Button variant="secondary" onClick={reset}>
            {t('action.retry')}
          </Button>
        )}
        <Link
          href="/mis"
          className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 text-base font-medium text-white"
        >
          {t('error.backHome')}
        </Link>
      </div>
    </div>
  );
}
