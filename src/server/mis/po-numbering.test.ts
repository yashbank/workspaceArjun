/**
 * PO numbering under concurrency — the same finding as `orders-numbering.test.ts` (MIS-111,
 * F-38), applied to `nextPoNumber()`/`createPO`, which derived its number from the clock the
 * same way `nextOrderNumber()`/`createOrder` did. Two `createPO` calls landing in the same
 * millisecond (two people double-tapping "New PO") used to compute the identical `poNumber` and
 * the later one threw the raw unique-constraint violation instead of retrying. Fixed alongside
 * MIS-111 in the same Track 4 pass, since it is the identical bug in the sibling module.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let seq = 0;
const created: Row[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misPurchaseOrder: {
      // Mirrors the real unique constraint on `po_number` — a second row with the same number
      // throws, exactly as Postgres would, so a collision cannot pass silently.
      create: async ({ data }: Row) => {
        if (created.some((p) => p.poNumber === data.poNumber)) {
          throw Object.assign(new Error('Unique constraint failed on the fields: (`po_number`)'), { code: 'P2002' });
        }
        const row = { id: `po-${++seq}`, purpose: data.purpose ?? 'FOR_ORDER', ...data };
        created.push(row);
        return row;
      },
    },
  },
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const getCurrentUser = vi.fn();
const getMisRole = vi.fn();

const { createPO } = await import('./po');

beforeEach(() => {
  seq = 0;
  created.length = 0;
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('PO numbering under concurrency (MIS-111\'s finding, applied to POs)', () => {
  it('creating 20 buffer-stock POs concurrently produces 20 distinct PO numbers, none dropped or thrown away', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => createPO({ purpose: 'BUFFER_STOCK' })),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(20);
    const numbers = succeeded.map((r) => (r as PromiseFulfilledResult<Row>).value.poNumber);
    expect(new Set(numbers).size).toBe(20);
    // And the buffer-stock purpose survives the retry loop on every one of them (Part B).
    expect(succeeded.every((r) => (r as PromiseFulfilledResult<Row>).value.purpose === 'BUFFER_STOCK')).toBe(true);
  });

  it('sequential creation (no real concurrency) already worked — the bug was specifically about the same millisecond', async () => {
    const a = await createPO({ bomRef: 'BOM-1' });
    await new Promise((r) => setTimeout(r, 2));
    const b = await createPO({ bomRef: 'BOM-2' });
    expect(a.poNumber).not.toBe(b.poNumber);
  });
});
