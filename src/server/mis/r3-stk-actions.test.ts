/**
 * R3-STK B21 — every exported action of the store, GRN and supplier-invoice action files returns a refusal as DATA
 * (`{ ok: false, detail }`), so production shows the real sentence; a permission refusal is still thrown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const boom = () => { throw new Error('PO PO-1 is CANCELLED; goods can only be received against an approved PO.'); };
const forbidden = () => { throw Object.assign(new Error('Not permitted: grn.write'), { digest: 'MIS_FORBIDDEN' }); };
const refuse = vi.fn((..._args: unknown[]): unknown => boom());

vi.mock('@/server/mis/grn', () => ({
  createGRN: (...a: unknown[]) => refuse(...a), addGRNItem: (...a: unknown[]) => refuse(...a), updateGRNItem: (...a: unknown[]) => refuse(...a),
  updateGRNHeader: (...a: unknown[]) => refuse(...a), confirmGRN: (...a: unknown[]) => refuse(...a), removeGRNItem: (...a: unknown[]) => refuse(...a),
  discardGRN: (...a: unknown[]) => refuse(...a),
}));
vi.mock('@/server/mis/store', () => ({
  commitIssue: (...a: unknown[]) => refuse(...a), commitReceipt: (...a: unknown[]) => refuse(...a), createStoreIn: (...a: unknown[]) => refuse(...a),
  createStoreOut: (...a: unknown[]) => refuse(...a), recordPhysicalCount: (...a: unknown[]) => refuse(...a), reconcilePhysicalCount: (...a: unknown[]) => refuse(...a),
  updateStoreItemProps: (...a: unknown[]) => refuse(...a), deactivateStoreItem: (...a: unknown[]) => refuse(...a),
}));
vi.mock('@/server/mis/supplier-invoice', () => ({ reconcileSupplierInvoice: (...a: unknown[]) => refuse(...a) }));

const grn = await import('@/app/(mis)/mis/grn/actions');
const storeActions = await import('@/app/(mis)/mis/store/actions');
const invoices = await import('@/app/(mis)/mis/supplier-invoices/actions');

const CALLS: [string, () => Promise<unknown>][] = [
  ['createGrnAction', () => grn.createGrnAction('po1')],
  ['updateGrnHeaderAction', () => grn.updateGrnHeaderAction('g1', {})],
  ['addGrnItemAction', () => grn.addGrnItemAction('g1', { poItemId: 'p', receivedQty: 1 })],
  ['updateGrnItemAction', () => grn.updateGrnItemAction('gi', 'g1', {})],
  ['removeGrnItemAction', () => grn.removeGrnItemAction('gi', 'g1')],
  ['discardGrnAction', () => grn.discardGrnAction('g1')],
  ['confirmGrnAction', () => grn.confirmGrnAction('g1')],
  ['storeInAction', () => storeActions.storeInAction({ itemId: 'i', quantity: 1 })],
  ['storeOutAction', () => storeActions.storeOutAction({ itemId: 'i', quantity: 1 })],
  ['physicalCountAction', () => storeActions.physicalCountAction({ itemId: 'i', physicalQty: 1, countDate: '2026-10-10' })],
  ['reconcileCountAction', () => storeActions.reconcileCountAction('c1', 'reason')],
  ['updateStoreItemAction', () => storeActions.updateStoreItemAction('i', {})],
  ['deactivateStoreItemAction', () => storeActions.deactivateStoreItemAction('i')],
  ['commitReceiptAction', () => storeActions.commitReceiptAction([{ itemId: 'i', qty: 1 }], {}, 'key')],
  ['commitIssueAction', () => storeActions.commitIssueAction([{ itemId: 'i', qty: 1 }], {}, 'key')],
  ['reconcileSupplierInvoiceAction', () => invoices.reconcileSupplierInvoiceAction('inv1')],
];

beforeEach(() => { refuse.mockImplementation(boom); });

describe('every action returns a refusal as data', () => {
  it.each(CALLS)('%s', async (_name, call) => {
    expect(await call()).toEqual({ ok: false, detail: 'PO PO-1 is CANCELLED; goods can only be received against an approved PO.' });
  });

  it.each(CALLS)('%s still throws a permission refusal for the error boundary', async (_name, call) => {
    refuse.mockImplementation(forbidden);
    await expect(call()).rejects.toThrow(/Not permitted/);
  });
});

describe('the cart actions pass the idempotency key to the server', () => {
  it('commitReceiptAction and commitIssueAction put the key in meta', async () => {
    refuse.mockClear();
    refuse.mockImplementation((() => ({ reference: 'r', lineCount: 1, totalQty: 1 })) as never);
    await storeActions.commitReceiptAction([{ itemId: 'i', qty: 1 }], { poId: 'p', overReceiptReason: 'because' }, 'key-1');
    await storeActions.commitIssueAction([{ itemId: 'i', qty: 1 }], {}, 'key-2');
    expect(refuse.mock.calls[0][1]).toMatchObject({ poId: 'p', overReceiptReason: 'because', idempotencyKey: 'key-1' });
    expect(refuse.mock.calls[1][1]).toMatchObject({ idempotencyKey: 'key-2' });
  });
});
