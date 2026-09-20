/**
 * Phase 14 · MIS-40 — toggle persistence: the language a person picks is the language they get
 * next time, on any device, and junk in the column can never break a page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const findUnique = vi.fn(async ({ where }: { where: { userProfileId: string } }) => {
  const locale = store.get(where.userProfileId);
  return locale === undefined ? null : { locale };
});
const upsert = vi.fn(async ({ where, create, update }: { where: { userProfileId: string }; create: { locale: string }; update: { locale: string } }) => {
  store.set(where.userProfileId, store.has(where.userProfileId) ? update.locale : create.locale);
});
vi.mock('@/server/db', () => ({ db: { misUserPreference: { findUnique: (a: never) => findUnique(a), upsert: (a: never) => upsert(a) } } }));

const { getLocale, setLocale } = await import('./preferences');

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe('getLocale', () => {
  it('defaults to English for a person who never touched the toggle', async () => {
    expect(await getLocale('u1')).toBe('en');
  });

  it('English for an empty id, without a database call', async () => {
    expect(await getLocale('')).toBe('en');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('a junk value in the column (a locale that was later removed) reads as English, never throws', async () => {
    store.set('u1', 'te'); // Telugu — out of scope (S7)
    expect(await getLocale('u1')).toBe('en');
  });
});

describe('setLocale → getLocale round trip', () => {
  it('a first choice creates the row; the next read returns it', async () => {
    await setLocale('u1', 'hi');
    expect(await getLocale('u1')).toBe('hi');
    expect(upsert).toHaveBeenCalledWith({ where: { userProfileId: 'u1' }, create: { userProfileId: 'u1', locale: 'hi' }, update: { locale: 'hi' } });
  });

  it('switching back updates the same row', async () => {
    await setLocale('u1', 'hi');
    await setLocale('u1', 'en');
    expect(await getLocale('u1')).toBe('en');
    expect(store.size).toBe(1);
  });

  it('a value that is not a supported locale is stored as English, not as itself', async () => {
    await setLocale('u1', 'fr' as never);
    expect(store.get('u1')).toBe('en');
  });

  it("one person's choice never changes another's", async () => {
    await setLocale('u1', 'hi');
    expect(await getLocale('u2')).toBe('en');
  });
});
