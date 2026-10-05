/**
 * Track 4 (Phase 28) · E5-09 (MIS-108/132/133) — `addOrderDocumentAction` is the thin wrapper
 * that lets the order detail screen attach the customer's PO (and anything else) as a document,
 * reusing `documents.ts`'s own, unmodified `addDocument` rather than a second storage path or a
 * new `customerPoNumber` field on `MisOrder` — see the comment on the action itself for why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));

const addDocument = vi.fn();
vi.mock('@/server/mis/documents', () => ({ addDocument: (...a: unknown[]) => addDocument(...a) }));

const isMisForbiddenError = vi.fn();
vi.mock('@/server/mis/auth', () => ({ isMisForbiddenError: (...a: unknown[]) => isMisForbiddenError(...a) }));
vi.mock('@/server/mis/orders', () => ({
  createOrder: vi.fn(),
  OrderReopenError: class OrderReopenError extends Error {},
  reopenOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

const { addOrderDocumentAction } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  isMisForbiddenError.mockReturnValue(false);
});

describe('addOrderDocumentAction', () => {
  it('passes the order id and the document fields straight through to addDocument', async () => {
    addDocument.mockResolvedValue({ id: 'doc1' });

    await addOrderDocumentAction('order-1', { name: 'Customer PO', description: 'PO from Acme', filePath: 'https://files.example/po.pdf' });

    expect(addDocument).toHaveBeenCalledWith('order-1', {
      name: 'Customer PO',
      description: 'PO from Acme',
      filePath: 'https://files.example/po.pdf',
    });
  });

  it('revalidates the order detail page it was called from, not the whole orders list', async () => {
    addDocument.mockResolvedValue({ id: 'doc1' });

    await addOrderDocumentAction('order-7', { name: 'Artwork approval', filePath: '/local/artwork.pdf' });

    expect(revalidatePath).toHaveBeenCalledWith('/mis/orders/order-7');
  });

  it('a rejection from addDocument (e.g. a role without orders.write) propagates rather than being swallowed', async () => {
    addDocument.mockRejectedValue(new Error('Forbidden'));
    await expect(addOrderDocumentAction('order-1', { name: 'X', filePath: 'https://x' })).rejects.toThrow('Forbidden');
  });
});
