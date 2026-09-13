import { db } from '@/server/db';
import { DEFAULT_LOCALE, toLocale, type Locale } from '@/lib/mis/i18n';

/**
 * Per-user MIS preferences.
 *
 * Stored in mis_user_preferences rather than as a column on user_profiles, so
 * the live product's own table keeps exactly the shape it has today.
 */

/** The user's locale, defaulting to English. Never throws on a junk value. */
export async function getLocale(userId: string): Promise<Locale> {
  if (!userId) return DEFAULT_LOCALE;

  const pref = await db.misUserPreference.findUnique({
    where: { userProfileId: userId },
    select: { locale: true },
  });

  return toLocale(pref?.locale);
}

/**
 * Persist the user's locale.
 *
 * Upsert because most users have no preference row until the first time they
 * touch the toggle.
 */
export async function setLocale(userId: string, locale: Locale): Promise<void> {
  const safe = toLocale(locale);
  await db.misUserPreference.upsert({
    where: { userProfileId: userId },
    create: { userProfileId: userId, locale: safe },
    update: { locale: safe },
  });
}
