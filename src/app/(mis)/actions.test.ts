/**
 * Phase 14 · MIS-40 — `setLocaleAction` is a public endpoint (any server action is), so it
 * re-checks who is calling instead of trusting the toggle that renders it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const setLocale = vi.fn();
vi.mock('@/server/mis/preferences', () => ({ setLocale: (...a: unknown[]) => setLocale(...a) }));
const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { setLocaleAction } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MIS_ENABLED_ACCOUNTS = 'flagged-user';
});

describe('setLocaleAction', () => {
  it('a flagged user persists their own choice, keyed by the SESSION user — never by an argument', async () => {
    getCurrentUser.mockResolvedValue({ id: 'flagged-user' });
    await setLocaleAction('hi');
    expect(setLocale).toHaveBeenCalledWith('flagged-user', 'hi');
    expect(revalidatePath).toHaveBeenCalledWith('/mis');
  });

  it('a value that is not a locale is coerced to English before it is written', async () => {
    getCurrentUser.mockResolvedValue({ id: 'flagged-user' });
    await setLocaleAction('klingon' as never);
    expect(setLocale).toHaveBeenCalledWith('flagged-user', 'en');
  });

  it('an unflagged account writes nothing and hears nothing (no error that would confirm the MIS exists)', async () => {
    getCurrentUser.mockResolvedValue({ id: 'someone-else' });
    await expect(setLocaleAction('hi')).resolves.toBeUndefined();
    expect(setLocale).not.toHaveBeenCalled();
  });

  it('no session writes nothing', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(setLocaleAction('hi')).resolves.toBeUndefined();
    expect(setLocale).not.toHaveBeenCalled();
  });
});
