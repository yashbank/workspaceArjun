/**
 * D13's add action: a failure comes back as a message WITH what was typed (a dropped connection must not cost the
 * person the link they had pasted), a success redirects to the fixed page, and `redirect()` — which throws to leave the
 * action — is never swallowed by the action's own try/catch.
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
const saveDocumentLink = vi.fn();
vi.mock('@/server/mis/document-library', () => ({ saveDocumentLink: (...a: unknown[]) => saveDocumentLink(...a) }));

const { addDocumentLinkAction } = await import('./desktop-actions');

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
const GOOD = { orderId: 'o1', name: 'COA', description: 'March', link: 'https://files.example.com/coa.pdf' };

beforeEach(() => {
  vi.clearAllMocks();
  saveDocumentLink.mockResolvedValue({});
});

describe('addDocumentLinkAction', () => {
  it('hands the four fields to the server function and redirects to the fixed page', async () => {
    await expect(addDocumentLinkAction({ error: null }, form(GOOD))).rejects.toMatchObject({ url: '/mis/documents?added=1' });
    expect(saveDocumentLink).toHaveBeenCalledWith(GOOD);
    expect(revalidatePath).toHaveBeenCalledWith('/mis/documents');
  });

  it('a refusal comes back as a message with what was typed, and neither redirects nor revalidates', async () => {
    saveDocumentLink.mockRejectedValue(new Error('A document needs a name.'));
    const state = await addDocumentLinkAction({ error: null }, form({ ...GOOD, name: '' }));
    expect(state).toEqual({ error: 'A document needs a name.', values: { ...GOOD, name: '' } });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('a Forbidden refusal is a message too, not a crash', async () => {
    saveDocumentLink.mockRejectedValue(new Error('Not permitted: orders.write'));
    expect(await addDocumentLinkAction({ error: null }, form(GOOD))).toMatchObject({ error: 'Not permitted: orders.write' });
  });

  it('missing fields are passed as empty text, so the server function — not the action — decides', async () => {
    await expect(addDocumentLinkAction({ error: null }, form({}))).rejects.toBeInstanceOf(Redirect);
    expect(saveDocumentLink).toHaveBeenCalledWith({ orderId: '', name: '', description: '', link: '' });
  });

  it('a posted redirect target is ignored — the page is fixed in the action', async () => {
    await expect(addDocumentLinkAction({ error: null }, form({ ...GOOD, returnTo: 'https://evil.example' }))).rejects.toMatchObject({ url: '/mis/documents?added=1' });
  });
});
