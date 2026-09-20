'use client';

import { useTransition } from 'react';

import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/mis/i18n';
import { cn } from '@/lib/utils';

import { useMisLocale } from './locale-provider';

/**
 * English · हिंदी. Two options, each written in its own script.
 *
 * The switch is optimistic — the label changes on tap — and the write to the
 * user record happens behind it, so a slow connection never makes the toggle
 * feel broken. No Telugu: it is out of scope (S7).
 */
export function LangToggle({ onPersist }: { onPersist: (locale: Locale) => Promise<void> }) {
  const { locale, setLocale, t } = useMisLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="inline-flex rounded-lg border border-slate-300 p-0.5"
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() => {
              if (active) return;
              setLocale(option);
              startTransition(() => {
                void onPersist(option);
              });
            }}
            className={cn(
              'min-h-11 rounded-md px-3 text-base',
              active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
            )}
          >
            {LOCALE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
