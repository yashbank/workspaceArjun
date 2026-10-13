/** R3-ORD B112: the order, BOM and approval actions return a refusal as data. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/mis/documents', () => ({ addDocument: vi.fn() }));
vi.mock('@/server/mis/auth', () => ({ isMisForbiddenError: () => false }));

const refuse = (m: string) => vi.fn().mockRejectedValue(new Error(m));
const orders = { createOrder: refuse('customer is required'), updateOrder: refuse('Order ORD-1 is delivered. Reopen it first.') };
vi.mock('@/server/mis/orders', () => ({
  createOrder: (...a: unknown[]) => orders.createOrder(...a),
  updateOrder: (...a: unknown[]) => orders.updateOrder(...a),
  updateOrderStatus: vi.fn(),
  reopenOrder: vi.fn(),
  isOrderStatusError: () => false,
  OrderReopenError: class extends Error {},
}));
const bom = { createBom: refuse('Order ORD-1 is cancelled. Reopen it first.') };
vi.mock('@/server/mis/bom', () => ({
  createBom: (...a: unknown[]) => bom.createBom(...a),
  addBomStage: vi.fn(), addBomMaterial: vi.fn(), submitBomForApproval: vi.fn(), approveBom: vi.fn(), rejectBom: vi.fn(),
  deleteBom: vi.fn(), deleteBomStage: vi.fn(), deleteBomMaterial: vi.fn(), reorderBomStages: vi.fn(), updateBomStage: vi.fn(), updateBomMaterial: vi.fn(),
}));
const approvals = { approveLeave: refuse('Already decided'), approveExtraPayDay: refuse('Not pending'), rejectExtraPayDay: refuse('Not pending') };
vi.mock('@/server/mis/attendance', () => ({ approveLeave: (...a: unknown[]) => approvals.approveLeave(...a) }));
vi.mock('@/server/mis/po', () => ({ approvePO: vi.fn() }));
vi.mock('@/server/mis/extra-pay-days', () => ({
  approveExtraPayDay: (...a: unknown[]) => approvals.approveExtraPayDay(...a),
  rejectExtraPayDay: (...a: unknown[]) => approvals.rejectExtraPayDay(...a),
}));

const orderActions = await import('@/app/(mis)/mis/orders/actions');
const bomActions = await import('@/app/(mis)/mis/bom/actions');
const approvalActions = await import('@/app/(mis)/mis/approvals/actions');

beforeEach(() => vi.clearAllMocks());

describe('orders/actions.ts', () => {
  it('saveOrderAction returns the refusal instead of throwing', async () => {
    expect(await orderActions.saveOrderAction('o1', { customerId: 'c' })).toEqual({ ok: false, detail: 'Order ORD-1 is delivered. Reopen it first.' });
    expect(await orderActions.saveOrderAction(null, {})).toEqual({ ok: false, detail: 'customer is required' });
  });
});

describe('bom/actions.ts', () => {
  it('createBomAction returns the refusal instead of throwing', async () => {
    expect(await bomActions.createBomAction('o1')).toEqual({ ok: false, detail: 'Order ORD-1 is cancelled. Reopen it first.' });
  });
});

describe('approvals/actions.ts', () => {
  it('leave and extra-pay actions return the refusal instead of throwing', async () => {
    expect(await approvalActions.approveLeaveAction('l1', true)).toEqual({ ok: false, detail: 'Already decided' });
    expect(await approvalActions.approveExtraPayDayAction('x1')).toEqual({ ok: false, detail: 'Not pending' });
    expect(await approvalActions.rejectExtraPayDayAction('x1')).toEqual({ ok: false, detail: 'Not pending' });
  });
});
