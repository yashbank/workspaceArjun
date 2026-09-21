/**
 * D12's form action: a failure comes back as a message WITH what was typed (the form is not blanked), a success
 * redirects to the fixed page, and `redirect()` — which throws to leave the action — is never swallowed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

class Redirect extends Error {
  constructor(public url: string) {
    super('NEXT_REDIRECT');
  }
}
const redirect = vi.fn((url: string) => {
  throw new Redirect(url);
});
const revalidatePath = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const scheduleBusinessRule = vi.fn();
vi.mock('@/server/mis/business-rules', () => ({ scheduleBusinessRule: (...a: unknown[]) => scheduleBusinessRule(...a) }));

const { scheduleRuleAction } = await import('./actions');

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const GOOD = { ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1.5', effectiveFrom: '2026-10-01', reason: 'Ink change' };

beforeEach(() => {
  vi.clearAllMocks();
  scheduleBusinessRule.mockResolvedValue({});
});

describe('scheduleRuleAction', () => {
  it('passes the four fields to the server function and redirects to the rule\'s own page', async () => {
    await expect(scheduleRuleAction({ error: null }, form(GOOD))).rejects.toMatchObject({ url: '/mis/settings/rules?rule=AQL_MAJOR_MAX&scheduled=1' });
    expect(scheduleBusinessRule).toHaveBeenCalledWith({ ruleKey: 'AQL_MAJOR_MAX', ruleValue: '1.5', effectiveFrom: '2026-10-01', reason: 'Ink change' });
    expect(revalidatePath).toHaveBeenCalledWith('/mis/settings/rules');
    expect(revalidatePath).toHaveBeenCalledWith('/mis/settings');
  });

  it('a refusal comes back as a message with what was typed, and does not redirect or revalidate', async () => {
    scheduleBusinessRule.mockRejectedValue(new Error('A reason is required'));
    const state = await scheduleRuleAction({ error: null }, form({ ...GOOD, reason: '' }));
    expect(state).toEqual({ error: 'A reason is required', values: { ruleValue: '1.5', effectiveFrom: '2026-10-01', reason: '' } });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('a Forbidden refusal is a message too, not a crash', async () => {
    scheduleBusinessRule.mockRejectedValue(new Error('Not permitted'));
    expect(await scheduleRuleAction({ error: null }, form(GOOD))).toMatchObject({ error: 'Not permitted' });
  });

  it('no rule chosen is refused before the server function runs', async () => {
    expect(await scheduleRuleAction({ error: null }, form({ ...GOOD, ruleKey: '' }))).toMatchObject({ error: 'Choose a rule to change.' });
    expect(scheduleBusinessRule).not.toHaveBeenCalled();
  });

  it('a posted redirect target is ignored — the page is fixed in the action', async () => {
    await expect(scheduleRuleAction({ error: null }, form({ ...GOOD, returnTo: 'https://evil.example' }))).rejects.toMatchObject({ url: expect.stringMatching(/^\/mis\/settings\/rules\?/) });
  });
});
