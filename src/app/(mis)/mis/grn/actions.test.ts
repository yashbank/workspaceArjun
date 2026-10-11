/**
 * F2 (D) — `createGrnAction` and `confirmGrnAction` return a refusal as DATA (`asResult`), like
 * their sibling actions, so production shows the real sentence instead of Next's generic one.
 * A permission refusal is still thrown: the (mis) error boundary owns that page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const createGRN = vi.fn();
const confirmGRN = vi.fn();
vi.mock('@/server/mis/grn', () => ({
  createGRN: (...a: unknown[]) => createGRN(...a),
  confirmGRN: (...a: unknown[]) => confirmGRN(...a),
  addGRNItem: vi.fn(),
  updateGRNItem: vi.fn(),
  updateGRNHeader: vi.fn(),
}));

const { confirmGrnAction, createGrnAction } = await import('./actions');

beforeEach(() => vi.clearAllMocks());

describe('confirmGrnAction', () => {
  it('returns ok on success', async () => {
    confirmGRN.mockResolvedValue({});
    expect(await confirmGrnAction('g1')).toEqual({ ok: true, value: undefined });
  });

  it('returns the real refusal as data instead of throwing', async () => {
    confirmGRN.mockRejectedValue(new Error('GRN already confirmed'));
    expect(await confirmGrnAction('g1')).toEqual({ ok: false, detail: 'GRN already confirmed' });
  });

  it('still throws a permission refusal for the error boundary', async () => {
    confirmGRN.mockRejectedValue(Object.assign(new Error('Not permitted: grn.write'), { digest: 'MIS_FORBIDDEN' }));
    await expect(confirmGrnAction('g1')).rejects.toThrow(/Not permitted/);
  });
});

describe('createGrnAction', () => {
  it('returns the new id on success and the refusal as data on failure', async () => {
    createGRN.mockResolvedValueOnce({ id: 'g9' });
    expect(await createGrnAction('po1')).toEqual({ ok: true, value: 'g9' });
    createGRN.mockRejectedValueOnce(new Error('Invoice date must be a valid date (YYYY-MM-DD).'));
    expect(await createGrnAction('po1')).toEqual({ ok: false, detail: 'Invoice date must be a valid date (YYYY-MM-DD).' });
  });
});
