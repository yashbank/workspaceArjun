'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  DEFAULT_LOCALE,
  createTranslator,
  type Locale,
  type TranslationKey,
} from '@/lib/mis/i18n';

type LocaleContextValue = {
  locale: Locale;
  t: (key: TranslationKey) => string;
  /** Optimistic switch. The caller persists to the user record. */
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Holds the active locale for the MIS subtree.
 *
 * The initial value comes from the server so the first paint is already in the
 * right language — a worker who picked Hindi should never see a flash of
 * English while a client effect catches up.
 */
export function MisLocaleProvider({
  initialLocale,
  onLocaleChange,
  children,
}: {
  initialLocale: Locale;
  onLocaleChange?: (locale: Locale) => void;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: createTranslator(locale),
      setLocale: (next: Locale) => {
        setLocaleState(next);
        onLocaleChange?.(next);
      },
    }),
    [locale, onLocaleChange],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Read the active locale and translator.
 *
 * Falls back to English outside a provider so an isolated component in a test
 * still renders readable text instead of throwing.
 */
export function useMisLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  return {
    locale: DEFAULT_LOCALE,
    t: createTranslator(DEFAULT_LOCALE),
    setLocale: () => {},
  };
}

/** Shorthand for the common case. */
export function useT(): (key: TranslationKey) => string {
  return useMisLocale().t;
}
