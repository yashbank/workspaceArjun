/**
 * Phase 16 · MIS-111 — order numbering under concurrency.
 *
 * `nextOrderNumber()` (private to `orders.ts`) builds the number from the server clock's
 * year/month plus the last 5 digits of `Date.now()` — no database-serialised counter. Two
 * `createOrder` calls landing in the same millisecond (a real possibility: two people
 * double-tapping "New order", or a batch import) collide, and `orderNumber` is `@unique` in the
 * schema, so a real collision would be a thrown constraint violation, not a graceful retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

type Row = Record<string, any>;
let seq = 0;
const created: Row[] = [];

vi.mock('@/server/db', () => ({
  db: {
    misOrder: {
      // Mirrors the real unique constraint on `orderNumber` — a second row with the same
      // number throws, exactly as Postgres would, so a collision cannot pass silently.
      create: async ({ data }: Row) => {
        if (created.some((o) => o.orderNumber === data.orderNumber)) {
          const err = new Error('Unique constraint failed on the fields: (`order_number`)') as Error & { code?: string };
          err.code = 'P2002';
          throw err;
        }
        const row = { id: `ord-${++seq}`, ...data };
        created.push(row);
        return row;
      },
    },
  },
}));

vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

const { createOrder } = await import('./orders');

beforeEach(() => {
  seq = 0;
  created.length = 0;
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('ADMIN');
});

describe('order numbering under concurrency (MIS-111)', () => {
  // New finding (F-38): `nextOrderNumber()` is not collision-proof. Fired concurrently (no real
  // I/O delay in this fake, so every call executes inside the same millisecond — the exact
  // scenario the ticket asks to hammer), several calls compute the IDENTICAL orderNumber and the
  // later ones throw the unique-constraint error instead of retrying or serialising. Asserted as
  // the spec-correct behaviour ("hammers the generator... asserts no duplicates") under
  // `it.fails`, per this project's convention for a QA-found gap.
  it.fails('creating 20 orders concurrently produces 20 distinct order numbers, none dropped or thrown away', async () => {
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => createOrder({})));
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    expect(succeeded).toHaveLength(20);
    const numbers = succeeded.map((r) => (r as PromiseFulfilledResult<Row>).value.orderNumber);
    expect(new Set(numbers).size).toBe(20);
  });

  it('sequential creation (no real concurrency) already works — the bug above is specifically about the same millisecond', async () => {
    const a = await createOrder({});
    await new Promise((r) => setTimeout(r, 2));
    const b = await createOrder({});
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });
});
