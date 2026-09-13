/**
 * MIS i18n — pure lookup, no React and no I/O.
 *
 * Components never hold a user-facing English string; they hold a key and call
 * t(). That is what makes the Hindi toggle a data change rather than a rewrite.
 */

import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  LOCALES,
  type Locale,
  type TranslationKey,
} from './dictionaries';

export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  type Locale,
  type TranslationKey,
} from './dictionaries';

/** Narrow an arbitrary string (a DB column, a cookie) to a supported locale. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Coerce anything to a supported locale, falling back to English. */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Translate a key.
 *
 * A missing Hindi string falls back to English rather than rendering blank —
 * a half-translated screen is usable, an empty one is not.
 */
export function translate(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
  return dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
}

/** Bind a locale once and get a t() to pass down. */
export function createTranslator(locale: Locale) {
  return (key: TranslationKey): string => translate(key, locale);
}

/**
 * Pick the right label for a master-data record.
 *
 * Master rows carry an optional Hindi label. Showing an empty cell because
 * nobody has translated a machine name yet is worse than showing the English
 * one, so a blank nameHi always falls back.
 */
export function resolveLabel(
  name: string,
  nameHi: string | null | undefined,
  locale: Locale,
): string {
  if (locale === 'hi' && nameHi && nameHi.trim().length > 0) {
    return nameHi;
  }
  return name;
}
