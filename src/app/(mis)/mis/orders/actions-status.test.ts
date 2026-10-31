/** C4 — the status action returns a refusal as data (so the screen can show it) and rethrows the unexpected. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock('@/server/mis/documents', () => ({ addDocument: vi.fn() }));
const isMisForbiddenError = vi.fn();
vi.mock('@/server/mis/auth', () => ({ isMisForbiddenError: (...a: unknown[]) => isMisForbiddenError(...a) }));

const updateOrderStatus = vi.fn();
class FakeStatusError extends Error {
  constructor(readonly reason: string, message: string, readonly gates?: unknown[]) { super(message); this.name = 'OrderStatusError'; }
}
vi.mock('@/server/mis/orders', () => ({
  createOrder: vi.fn(), OrderReopenError: class extends Error {}, reopenOrder: vi.fn(), updateOrder: vi.fn(),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  isOrderStatusError: (e: unknown) => e instanceof FakeStatusError,
}));

const { updateOrderStatusAction } = await import('./actions');

beforeEach(() => { vi.clearAllMocks(); isMisForbiddenError.mockReturnValue(false); });

describe('updateOrderStatusAction', () => {
  it('passes the reason through and revalidates the order and production', async () => {
    updateOrderStatus.mockResolvedValue({});
    expect(await updateOrderStatusAction('o1', 'COMPLETED', 'because')).toEqual({ ok: true });
    expect(updateOrderStatus).toHaveBeenCalledWith('o1', 'COMPLETED', { reason: 'because' });
    expect(revalidatePath).toHaveBeenCalledWith('/mis/orders/o1');
  });
  it('returns a refusal as data, with the unmet gates', async () => {
    updateOrderStatus.mockRejectedValue(new FakeStatusError('GATES_UNMET', 'unmet', [{ key: 'QC_RESOLVED' }]));
    // R2-267: the outcome also names the refusal reason, so the screen can offer the Owner's BOM override.
    expect(await updateOrderStatusAction('o1', 'COMPLETED')).toEqual({ ok: false, detail: 'unmet', reason: 'GATES_UNMET', gates: [{ key: 'QC_RESOLVED' }] });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it('returns a permission refusal as data', async () => {
    updateOrderStatus.mockRejectedValue(new Error('Not permitted'));
    isMisForbiddenError.mockReturnValue(true);
    expect(await updateOrderStatusAction('o1', 'COMPLETED')).toMatchObject({ ok: false });
  });
  it('rethrows anything unexpected', async () => {
    updateOrderStatus.mockRejectedValue(new Error('db down'));
    await expect(updateOrderStatusAction('o1', 'COMPLETED')).rejects.toThrow('db down');
  });
});
