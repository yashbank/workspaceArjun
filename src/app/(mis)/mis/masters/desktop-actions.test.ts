/**
 * D10's form actions: they turn a failure into a message the person can read, keep what was typed, and never let
 * `redirect()` (which throws to leave the action) be swallowed by their own try/catch.
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
const saveMaster = vi.fn();
const setMasterDeactivated = vi.fn();
vi.mock('@/server/mis/master-directory', () => ({ saveMaster: (...a: unknown[]) => saveMaster(...a), setMasterDeactivated: (...a: unknown[]) => setMasterDeactivated(...a) }));

const { saveMasterAction, setDeactivatedAction } = await import('./desktop-actions');

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  saveMaster.mockResolvedValue(undefined);
  setMasterDeactivated.mockResolvedValue(undefined);
});

describe('saveMasterAction', () => {
  it('on success it redirects to the master\'s OWN route — and the redirect is not swallowed', async () => {
    await expect(saveMasterAction({ error: null }, form({ master: 'machines', id: 'm1', name: 'X' }))).rejects.toMatchObject({ url: '/mis/masters/machines' });
    expect(saveMaster).toHaveBeenCalledWith('machines', 'm1', { name: 'X' });
    expect(revalidatePath).toHaveBeenCalledWith('/mis/masters/machines');
  });

  it('a create carries no id; the reserved fields never reach the values', async () => {
    await expect(saveMasterAction({ error: null }, form({ master: 'departments', code: 'C', name: 'N', id: '' }))).rejects.toBeInstanceOf(Redirect);
    expect(saveMaster).toHaveBeenCalledWith('departments', null, { code: 'C', name: 'N' });
  });

  it('a failure comes back as a message WITH what was typed, and does not redirect', async () => {
    saveMaster.mockRejectedValue(new Error('Name is required.'));
    const state = await saveMasterAction({ error: null }, form({ master: 'machines', id: 'm1', name: '', machineType: 'Offset' }));
    expect(state).toEqual({ error: 'Name is required.', values: { name: '', machineType: 'Offset' } });
    expect(redirect).not.toHaveBeenCalled();
  });

  it('an unknown master is refused before any server function runs; a posted redirect target is ignored', async () => {
    expect(await saveMasterAction({ error: null }, form({ master: 'nope' }))).toEqual({ error: 'Unknown master' });
    expect(saveMaster).not.toHaveBeenCalled();
    await expect(saveMasterAction({ error: null }, form({ master: 'machines', name: 'X', returnTo: 'https://evil.example', redirect: '/x' }))).rejects.toMatchObject({ url: '/mis/masters/machines' });
  });
});

describe('setDeactivatedAction', () => {
  it('goes back to the list with the deactivated rows showing on success', async () => {
    await expect(setDeactivatedAction(form({ master: 'machines', id: 'm1', deactivate: '1' }))).rejects.toMatchObject({ url: '/mis/masters/machines?deactivated=1' });
    expect(setMasterDeactivated).toHaveBeenCalledWith('machines', 'm1', true);
    await expect(setDeactivatedAction(form({ master: 'machines', id: 'm3', deactivate: '0' }))).rejects.toBeInstanceOf(Redirect);
    expect(setMasterDeactivated).toHaveBeenLastCalledWith('machines', 'm3', false);
  });

  it('a failure goes back to the same row with the reason — never an unhandled error', async () => {
    setMasterDeactivated.mockRejectedValue(new Error('That row no longer exists.'));
    await expect(setDeactivatedAction(form({ master: 'machines', id: 'ghost', deactivate: '1' }))).rejects.toMatchObject({
      url: '/mis/masters/machines?edit=ghost&error=That%20row%20no%20longer%20exists.',
    });
  });

  it('an unknown master or a missing id does nothing', async () => {
    await setDeactivatedAction(form({ master: 'nope', id: 'x' }));
    await setDeactivatedAction(form({ master: 'machines', id: '' }));
    expect(setMasterDeactivated).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
